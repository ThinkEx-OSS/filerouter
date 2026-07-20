import {
  DEFAULT_PARSE_OUTPUT,
  normalizeDocumentFileName,
  resolveDocumentMimeType,
} from "@file_router/sdk"
import type { ParseOutput, ProviderParseOptions } from "@file_router/sdk"
import { DEFAULT_PROVIDER_ID } from "@file_router/sdk/catalog"
import {
  HOSTED_JOB_HEADERS,
  MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES,
} from "@file_router/sdk/hosted"

import {
  DocumentJobRequestSchema,
  ParseOutputSchema,
  ProviderIdSchema,
} from "@/api/contracts"
import type { ProviderId } from "@/api/contracts"
import {
  MAX_HOSTED_UPLOAD_BYTES,
  MAX_HOSTED_UPLOAD_LABEL,
} from "@/lib/document-limits"
import { HttpError } from "@/lib/http.server"

const providerIds = ProviderIdSchema.options
const blockedHostedOptions: Record<ProviderId, ReadonlySet<string>> = {
  datalab: new Set([
    "checkpoint_id",
    "eval_rubric_id",
    "file",
    "file_url",
    "webhook_url",
    "workflowstepdata_id",
  ]),
  llamaparse: new Set([
    "configuration_id",
    "file_id",
    "http_proxy",
    "organization_id",
    "project_id",
    "source_url",
    "upload_file",
    "webhook_configuration_ids",
    "webhook_configurations",
  ]),
  "mistral-ocr": new Set(["document"]),
}

export type DocumentJobInput = {
  includeRaw: boolean
  operation: "compare" | "parse"
  outputs: Array<ParseOutput>
  pages?: Array<number>
  providerOptions?: ProviderParseOptions
  providers: Array<ProviderId>
  source:
    | { fileName: string; kind: "url"; url: string }
    | {
        body: ReadableStream<Uint8Array>
        contentType: string
        fileName: string
        kind: "upload"
      }
}

export async function readDocumentJobInput(
  request: Request,
  validatedJson?: unknown
): Promise<DocumentJobInput> {
  if (request.headers.get("content-type")?.includes("application/json")) {
    return readJsonJobInput(validatedJson ?? (await readJson(request)))
  }

  if (!request.body) {
    throw new HttpError(400, "Document body is required.")
  }
  const contentLength = Number(request.headers.get("content-length"))
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_HOSTED_UPLOAD_BYTES
  ) {
    throw new HttpError(
      413,
      `Hosted uploads are limited to ${MAX_HOSTED_UPLOAD_LABEL}.`,
      { code: "upload_too_large" }
    )
  }
  const operation = parseOperation(
    request.headers.get(HOSTED_JOB_HEADERS.operation) ?? "parse"
  )
  const fileName = decodeFileName(
    request.headers.get(HOSTED_JOB_HEADERS.fileName) ?? "document"
  )
  return {
    includeRaw: request.headers.get(HOSTED_JOB_HEADERS.includeRaw) === "true",
    operation,
    outputs: parseOutputArray(
      request.headers.get(HOSTED_JOB_HEADERS.outputs)?.split(",") ?? [
        DEFAULT_PARSE_OUTPUT,
      ]
    ),
    ...parseHeaderOptions(request),
    providers: parseProviders(
      operation,
      request.headers.get(HOSTED_JOB_HEADERS.provider),
      request.headers.get(HOSTED_JOB_HEADERS.providers)
    ),
    source: {
      body: request.body,
      contentType: resolveDocumentMimeType(
        fileName,
        request.headers.get("content-type") ?? undefined
      ),
      fileName,
      kind: "upload",
    },
  }
}

function readJsonJobInput(value: unknown): DocumentJobInput {
  const result = DocumentJobRequestSchema.safeParse(value)
  if (!result.success) {
    throw new HttpError(
      400,
      result.error.issues[0]?.message ?? "Invalid document job request.",
      { code: "invalid_job_request" }
    )
  }
  const { includeRaw, operation, outputs, pages, providerOptions, source } =
    result.data
  const url = new URL(source.url).toString()
  return {
    includeRaw: includeRaw ?? false,
    operation,
    outputs: [...new Set(outputs)],
    ...(pages && { pages: [...new Set(pages)] }),
    ...(providerOptions && {
      providerOptions: validateHostedProviderOptions(providerOptions),
    }),
    providers:
      operation === "parse"
        ? [result.data.provider ?? DEFAULT_PROVIDER_ID]
        : [...new Set(result.data.providers ?? providerIds)],
    source: { fileName: fileNameFromUrl(url), kind: "url", url },
  }
}

function parseHeaderOptions(
  request: Request
): Pick<DocumentJobInput, "pages" | "providerOptions"> {
  const pagesHeader = request.headers.get(HOSTED_JOB_HEADERS.pages)
  const optionsHeader = request.headers.get(HOSTED_JOB_HEADERS.providerOptions)
  const pages = pagesHeader
    ? pagesHeader.split(",").map((page) => Number(page.trim()))
    : undefined

  if (pages?.some((page) => !Number.isSafeInteger(page) || page < 1)) {
    throw new HttpError(400, "Pages must be positive, one-based integers.")
  }

  if (!optionsHeader) {
    return pages ? { pages: [...new Set(pages)] } : {}
  }
  if (
    new TextEncoder().encode(optionsHeader).byteLength >
    MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES
  ) {
    throw new HttpError(
      400,
      `Provider options exceed the ${MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES / 1024} KiB header limit.`
    )
  }

  let value: unknown
  try {
    value = JSON.parse(decodeURIComponent(optionsHeader)) as unknown
  } catch {
    throw new HttpError(400, "Invalid provider options header.")
  }

  return {
    ...(pages && { pages: [...new Set(pages)] }),
    providerOptions: validateHostedProviderOptions(value),
  }
}

function parseOperation(value: unknown): "compare" | "parse" {
  if (value === "parse" || value === "compare") {
    return value
  }
  throw new HttpError(400, "operation must be parse or compare.")
}

function parseProviders(
  operation: "compare" | "parse",
  provider: unknown,
  providers: unknown
): Array<ProviderId> {
  const values =
    operation === "parse"
      ? [typeof provider === "string" ? provider : DEFAULT_PROVIDER_ID]
      : Array.isArray(providers)
        ? providers
        : typeof providers === "string"
          ? providers.split(",")
          : [...providerIds]
  const parsed = values.map((value) => {
    const normalized = typeof value === "string" ? value.trim() : ""
    if (!isProviderId(normalized)) {
      throw new HttpError(400, `Unsupported provider: ${String(value)}`)
    }
    return normalized
  })
  return [...new Set(parsed)]
}

function parseOutputArray(value: unknown): Array<ParseOutput> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "At least one output is required.")
  }
  const parsed = value.map((output) => {
    const normalized = typeof output === "string" ? output.trim() : ""
    const result = ParseOutputSchema.safeParse(normalized)
    if (!result.success) {
      throw new HttpError(400, `Unsupported output: ${String(output)}`)
    }
    return result.data
  })
  return [...new Set(parsed)]
}

function decodeFileName(value: string): string {
  try {
    return normalizeDocumentFileName(decodeURIComponent(value))
  } catch {
    throw new HttpError(400, "Invalid document filename.")
  }
}

function fileNameFromUrl(value: string): string {
  return decodeFileName(new URL(value).pathname.split("/").at(-1) || "document")
}

function isProviderId(value: string): value is ProviderId {
  return ProviderIdSchema.safeParse(value).success
}

function validateHostedProviderOptions(value: unknown): ProviderParseOptions {
  if (!isRecord(value)) {
    throw new HttpError(400, "Provider options must be an object.")
  }

  for (const [providerId, options] of Object.entries(value)) {
    if (!isProviderId(providerId)) {
      throw new HttpError(400, `Unsupported provider options: ${providerId}`)
    }
    if (!isRecord(options)) {
      throw new HttpError(
        400,
        `Provider options for ${providerId} must be an object.`
      )
    }
    assertHostedOptionsAreSafe(providerId, options)
    if (providerId === "datalab" && isRecord(options.raw)) {
      assertHostedOptionsAreSafe(providerId, options.raw)
    }
  }
  return value as ProviderParseOptions
}

function assertHostedOptionsAreSafe(
  providerId: ProviderId,
  options: Record<string, unknown>
): void {
  const blocked = Object.keys(options).filter((key) =>
    blockedHostedOptions[providerId].has(key)
  )
  if (blocked.length > 0) {
    throw new HttpError(
      400,
      `Hosted ${providerId} options cannot set: ${blocked.join(", ")}.`
    )
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, "A valid JSON request body is required.")
  }
}
