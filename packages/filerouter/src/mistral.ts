import { FileRouterError } from "./errors"
import { readEnv } from "./internal/env"
import { selectOutputs } from "./internal/outputs"
import { providerOptions } from "./internal/provider-options"
import type { Mistral } from "@mistralai/mistralai"
import type { SDKOptions } from "@mistralai/mistralai/lib/config.js"
import type { RequestOptions } from "@mistralai/mistralai/lib/sdks.js"
import type {
  OCRImageObject,
  OCRPageObject,
  OCRRequest,
  OCRResponse,
  OCRTableObject,
} from "@mistralai/mistralai/models/components"
import type {
  FileRouterProvider,
  ParsedImage,
  ParsedTable,
  ParseOptions,
  ParseOutput,
  ParsePage,
  ParseResult,
  ProviderInput,
} from "./types"

const PROVIDER_ID = "mistral-ocr"
const OUTPUTS = [
  "images",
  "json",
  "markdown",
  "metadata",
  "pages",
  "tables",
] satisfies Array<ParseOutput>

type MistralClient = {
  files: Pick<Mistral["files"], "delete" | "upload">
  ocr: Pick<Mistral["ocr"], "process">
}

export interface MistralOcrProviderOptions {
  apiKey?: string
  client?: MistralClient
  clientOptions?: Omit<SDKOptions, "apiKey">
  fetch?: typeof globalThis.fetch
  model?: string
  serverURL?: string
}

/** Per-request options from Mistral's official OCR request type. */
export type MistralOcrParseOptions = Partial<Omit<OCRRequest, "document">>

export function mistralOcr(
  options: MistralOcrProviderOptions = {}
): FileRouterProvider<MistralClient | undefined> {
  return {
    capabilities: {
      execution: "sync",
      features: ["blocks", "confidence", "page-selection"],
      outputs: OUTPUTS,
    },
    id: PROVIDER_ID,
    name: "Mistral OCR",
    parse: (input, parseOptions) => parseMistral(input, parseOptions, options),
    raw: options.client,
  }
}

async function parseMistral(
  input: ProviderInput,
  parseOptions: ParseOptions,
  options: MistralOcrProviderOptions
): Promise<ParseResult> {
  const startedAt = new Date()
  const client = await resolveClient(options)
  const native = providerOptions<MistralOcrParseOptions>(
    parseOptions,
    PROVIDER_ID
  )
  const outputs = parseOptions.outputs ?? ["markdown"]
  const requestOptions = mistralRequestOptions(parseOptions)
  let uploadedFileId: string | undefined

  try {
    const document =
      input.kind === "url"
        ? { documentUrl: input.url, type: "document_url" as const }
        : {
            fileId: await uploadFile(client, input, requestOptions),
            type: "file" as const,
          }
    if (document.type === "file") {
      uploadedFileId = document.fileId
    }

    const response = await client.ocr.process(
      {
        ...native,
        document,
        includeImageBase64:
          outputs.includes("images") || native.includeImageBase64 === true,
        model: native.model ?? options.model ?? "mistral-ocr-latest",
        ...(parseOptions.pages && {
          pages: parseOptions.pages.map((page) => page - 1),
        }),
        ...(outputs.includes("tables") && {
          tableFormat: native.tableFormat ?? "markdown",
        }),
      },
      requestOptions
    )

    return normalizeMistral(
      response,
      outputs,
      parseOptions.includeRaw === true,
      startedAt
    )
  } finally {
    if (uploadedFileId) {
      await deleteFile(client, uploadedFileId, requestOptions)
    }
  }
}

async function resolveClient(
  options: MistralOcrProviderOptions
): Promise<MistralClient> {
  if (options.client) {
    return options.client
  }

  const apiKey = options.apiKey ?? readEnv("MISTRAL_API_KEY")
  if (!apiKey) {
    throw new FileRouterError("Mistral OCR requires MISTRAL_API_KEY.", {
      code: "Auth",
      providerId: PROVIDER_ID,
    })
  }

  try {
    const [{ Mistral }, { HTTPClient }] = await Promise.all([
      import("@mistralai/mistralai"),
      import("@mistralai/mistralai/lib/http.js"),
    ])
    return new Mistral({
      ...options.clientOptions,
      apiKey,
      ...(options.fetch && {
        httpClient: new HTTPClient({ fetcher: options.fetch }),
      }),
      ...(options.serverURL && { serverURL: options.serverURL }),
    })
  } catch (error) {
    throw new FileRouterError(
      "Mistral OCR requires the optional peer dependency '@mistralai/mistralai'.",
      {
        cause: error,
        code: "ProviderUnavailable",
        providerId: PROVIDER_ID,
      }
    )
  }
}

async function uploadFile(
  client: MistralClient,
  input: Extract<ProviderInput, { kind: "bytes" }>,
  requestOptions: RequestOptions
): Promise<string> {
  const file = await client.files.upload(
    {
      file: { content: input.data, fileName: input.name },
      purpose: "ocr",
      visibility: "user",
    },
    requestOptions
  )
  return file.id
}

async function deleteFile(
  client: MistralClient,
  fileId: string,
  requestOptions: RequestOptions
): Promise<void> {
  try {
    await client.files.delete({ fileId }, requestOptions)
  } catch {
    // Cleanup failure must not discard a completed OCR result.
  }
}

function mistralRequestOptions(options: ParseOptions): RequestOptions {
  return {
    ...(options.signal && { signal: options.signal }),
    ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
  }
}

function normalizeMistral(
  raw: OCRResponse,
  requestedOutputs: Array<ParseOutput>,
  includeRaw: boolean,
  startedAt: Date
): ParseResult {
  const pages = raw.pages.map(normalizePage)
  const markdown = pages.map((page) => page.markdown ?? "").join("\n\n---\n\n")
  const images = pages.flatMap((page) => page.images ?? [])
  const tables = pages.flatMap((page) => page.tables ?? [])
  const metadata = {
    documentAnnotation: raw.documentAnnotation,
    model: raw.model,
    usage: raw.usageInfo,
  }
  const completedAt = new Date()
  return {
    id: crypto.randomUUID(),
    outputs: selectOutputs(requestedOutputs, {
      images,
      json: raw,
      markdown,
      metadata,
      pages,
      tables,
    }),
    pageCount: pages.length,
    provider: PROVIDER_ID,
    ...(includeRaw && { raw }),
    timing: {
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
    },
    usage: { pages: raw.usageInfo.pagesProcessed },
    warnings: [],
  }
}

function normalizePage(raw: OCRPageObject): ParsePage {
  const pageNumber = raw.index + 1
  return {
    ...(raw.blocks && { blocks: raw.blocks }),
    ...(raw.confidenceScores && { confidence: raw.confidenceScores }),
    ...(raw.dimensions && {
      dimensions: {
        height: raw.dimensions.height,
        width: raw.dimensions.width,
      },
    }),
    ...(raw.footer && { footer: raw.footer }),
    ...(raw.header && { header: raw.header }),
    images: raw.images.map((image) => normalizeImage(image, pageNumber)),
    ...(raw.hyperlinks && { links: raw.hyperlinks }),
    markdown: raw.markdown,
    pageNumber,
    tables: (raw.tables ?? []).map((table) =>
      normalizeTable(table, pageNumber)
    ),
    warnings: [],
  }
}

function normalizeImage(raw: OCRImageObject, pageNumber: number): ParsedImage {
  return {
    bbox: {
      bottomRightX: raw.bottomRightX,
      bottomRightY: raw.bottomRightY,
      topLeftX: raw.topLeftX,
      topLeftY: raw.topLeftY,
    },
    ...(raw.imageAnnotation && { caption: raw.imageAnnotation }),
    ...(raw.imageBase64 && { data: raw.imageBase64 }),
    id: raw.id,
    pageNumber,
  }
}

function normalizeTable(raw: OCRTableObject, pageNumber: number): ParsedTable {
  return {
    content: raw.content,
    format: raw.format,
    ...(raw.format === "html" && { html: raw.content }),
    id: raw.id,
    ...(raw.format === "markdown" && { markdown: raw.content }),
    pageNumber,
  }
}
