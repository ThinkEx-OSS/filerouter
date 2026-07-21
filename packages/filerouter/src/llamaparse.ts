import { FileRouterError } from "./errors"
import { readEnv } from "./internal/env"
import { selectOutputs } from "./internal/outputs"
import { waitForProviderJob } from "./internal/polling"
import { providerOptions } from "./internal/provider-options"
import { isRecord } from "./internal/record"
import { DEFAULT_PARSE_OUTPUT } from "./types"
import type { ClientOptions, LlamaCloud } from "@llamaindex/llama-cloud"
import type {
  ParsingCreateParams,
  ParsingGetParams,
  ParsingGetResponse,
} from "@llamaindex/llama-cloud/resources/parsing"
import type {
  FileRouterProvider,
  ParsedImage,
  ParsedTable,
  ParseOptions,
  ParseOutput,
  ParsePage,
  ParseResult,
  ParseWarning,
  ProviderJobReference,
  ProviderJobs,
  ProviderJobStatus,
  ProviderInput,
} from "./types"

type LlamaParseResponse = ParsingGetResponse
type LlamaParseClient = {
  parsing: Pick<LlamaCloud["parsing"], "create" | "get">
}

export interface LlamaParseProviderOptions {
  apiKey?: string
  client?: LlamaParseClient
  clientOptions?: Omit<ClientOptions, "apiKey">
  organizationId?: string
  pollingIntervalMs?: number
  projectId?: string
  tier?: "agentic" | "agentic_plus" | "cost_effective" | "fast"
  version?: string
}

type ProtectedLlamaParseFields = "file_id" | "source_url"

export type LlamaParseParseOptions = Partial<
  Omit<ParsingCreateParams, ProtectedLlamaParseFields>
> &
  Pick<ParsingGetParams, "expand" | "image_filenames">

type LlamaParseRequestSource =
  | { source_url: string; upload_file?: never }
  | { source_url?: never; upload_file: Blob }

type LlamaParseRequest = ParsingCreateParams & {
  expand?: Array<string>
  upload_file?: Blob
}

const LLAMAPARSE_OUTPUTS: Array<ParseOutput> = [
  "markdown",
  "text",
  "pages",
  "tables",
  "images",
  "json",
  "metadata",
]

export const llamaparse = (
  opts: LlamaParseProviderOptions = {}
): FileRouterProvider<LlamaParseClient | undefined> => {
  const jobs = llamaParseJobs(opts)
  return {
    capabilities: {
      execution: "async",
      features: ["blocks", "page-selection"],
      outputs: LLAMAPARSE_OUTPUTS,
    },
    id: "llamaparse",
    jobs,
    name: "LlamaParse",
    raw: opts.client,
    parse: async (input, options) => {
      const job = await jobs.submit(input, options)
      return waitForProviderJob(
        "llamaparse",
        jobs,
        job,
        options,
        opts.pollingIntervalMs
      )
    },
  }
}

function llamaParseJobs(opts: LlamaParseProviderOptions): ProviderJobs {
  return {
    get: (job, options) => getLlamaParseJob(job, options, opts),
    submit: (input, options) => submitLlamaParse(input, options, opts),
  }
}

const submitLlamaParse = async (
  input: ProviderInput,
  options: ParseOptions,
  opts: LlamaParseProviderOptions
): Promise<ProviderJobReference> => {
  const [client, source] = await Promise.all([
    resolveClient(opts),
    toLlamaParseSource(input),
  ])
  const nativeOptions = providerOptions<LlamaParseParseOptions>(
    options,
    "llamaparse"
  )
  const request = llamaParseRequest(source, options, nativeOptions, opts)
  const job = await client.parsing.create(
    request,
    options.signal ? { signal: options.signal } : undefined
  )

  return {
    id: job.id,
    state: {
      ...(request.organization_id !== undefined && {
        organization_id: request.organization_id,
      }),
      ...(request.project_id !== undefined && {
        project_id: request.project_id,
      }),
    },
    submittedAt: new Date().toISOString(),
  }
}

const getLlamaParseJob = async (
  job: ProviderJobReference,
  options: ParseOptions,
  opts: LlamaParseProviderOptions
): Promise<ProviderJobStatus> => {
  const client = await resolveClient(opts)
  const outputs = options.outputs ?? [DEFAULT_PARSE_OUTPUT]
  const nativeOptions = providerOptions<LlamaParseParseOptions>(
    options,
    "llamaparse"
  )
  const organizationId = jobScope(
    job.state?.organization_id,
    opts.organizationId
  )
  const projectId = jobScope(job.state?.project_id, opts.projectId)
  const response = await client.parsing.get(
    job.id,
    {
      expand: mergeExpansions(outputsToExpand(outputs), nativeOptions.expand),
      ...(nativeOptions.image_filenames && {
        image_filenames: nativeOptions.image_filenames,
      }),
      ...(organizationId !== undefined && { organization_id: organizationId }),
      ...(projectId !== undefined && { project_id: projectId }),
    },
    options.signal ? { signal: options.signal } : undefined
  )

  if (response.job.status === "FAILED" || response.job.status === "CANCELLED") {
    return {
      error:
        response.job.error_message ??
        `LlamaParse job ${response.job.status.toLowerCase()}.`,
      status: "failed",
    }
  }
  if (response.job.status !== "COMPLETED") {
    return {
      status: response.job.status === "RUNNING" ? "running" : "pending",
    }
  }

  const completedAt = new Date()
  const startedAt = new Date(job.submittedAt)

  return {
    result: normalizeLlamaParseResponse(response, {
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      includeRaw: options.includeRaw === true,
      outputs,
      startedAt,
    }),
    status: "complete",
  }
}

const resolveClient = async (
  opts: LlamaParseProviderOptions
): Promise<LlamaParseClient> => {
  if (opts.client) {
    return opts.client
  }

  try {
    const llamaCloud = await import("@llamaindex/llama-cloud")
    const LlamaCloud = llamaCloud.default

    return new LlamaCloud({
      apiKey: opts.apiKey ?? readEnv("LLAMA_CLOUD_API_KEY"),
      ...opts.clientOptions,
    })
  } catch (error) {
    throw new FileRouterError(
      "LlamaParse requires the optional peer dependency '@llamaindex/llama-cloud'.",
      {
        cause: error,
        code: "ProviderUnavailable",
        providerId: "llamaparse",
      }
    )
  }
}

const outputsToExpand = (outputs: Array<ParseOutput>): Array<string> => {
  const expand = new Set<string>(["job_metadata"])

  if (outputs.includes("markdown") || outputs.includes("pages")) {
    expand.add("markdown")
  }
  if (outputs.includes("text") || outputs.includes("pages")) {
    expand.add("text")
  }
  if (
    outputs.includes("json") ||
    outputs.includes("tables") ||
    outputs.includes("images") ||
    outputs.includes("pages")
  ) {
    expand.add("items")
  }
  if (outputs.includes("images")) {
    expand.add("images_content_metadata")
  }
  if (outputs.includes("metadata") || outputs.includes("pages")) {
    expand.add("metadata")
  }

  return Array.from(expand)
}

const mergeExpansions = (
  required: Array<string>,
  requested?: Array<string>
): Array<string> => [...new Set([...required, ...(requested ?? [])])]

const jobScope = (
  value: boolean | null | number | string | undefined,
  fallback?: string
): string | null | undefined =>
  typeof value === "string" || value === null ? value : fallback

const llamaParseRequest = (
  source: LlamaParseRequestSource,
  options: ParseOptions,
  nativeOptions: LlamaParseParseOptions,
  provider: LlamaParseProviderOptions,
  additional: Pick<LlamaParseRequest, "expand"> = {}
): LlamaParseRequest => {
  const safeNativeOptions = omitKeys(nativeOptions, [
    "expand",
    "file_id",
    "image_filenames",
    "source_url",
    "upload_file",
  ])
  const configured = typeof nativeOptions.configuration_id === "string"
  return {
    ...safeNativeOptions,
    tier:
      nativeOptions.tier ??
      provider.tier ??
      (configured ? "configured" : "cost_effective"),
    version:
      nativeOptions.version ??
      provider.version ??
      (configured ? "configured" : "latest"),
    ...(options.pages && {
      page_ranges: {
        target_pages: options.pages.join(","),
      },
    }),
    ...additional,
    ...source,
    ...((nativeOptions.organization_id ?? provider.organizationId) !==
      undefined && {
      organization_id: nativeOptions.organization_id ?? provider.organizationId,
    }),
    ...((nativeOptions.project_id ?? provider.projectId) !== undefined && {
      project_id: nativeOptions.project_id ?? provider.projectId,
    }),
  }
}

const omitKeys = <Value extends object>(
  value: Value,
  keys: ReadonlyArray<string>
): Value => {
  const result = { ...value } as Record<string, unknown>
  for (const key of keys) delete result[key]
  return result as Value
}

const toLlamaParseSource = async (
  input: ProviderInput
): Promise<LlamaParseRequestSource> => {
  if (input.kind === "url") {
    return { source_url: input.url }
  }

  return {
    upload_file: await toLlamaFile(input.data, input.name, input.mimeType),
  }
}

const toLlamaFile = async (
  input: ArrayBuffer | ArrayBufferView | Blob,
  name?: string,
  mimeType?: string
): Promise<File> => {
  const { toFile } = await import("@llamaindex/llama-cloud")
  return toFile(input, name, mimeType ? { type: mimeType } : undefined)
}

const normalizeLlamaParseResponse = (
  raw: LlamaParseResponse,
  timing: {
    completedAt: Date
    durationMs: number
    includeRaw: boolean
    outputs: Array<ParseOutput>
    startedAt: Date
  }
): ParseResult => {
  const includeRaw = timing.includeRaw
  const warnings: Array<ParseWarning> = []
  const pagesByNumber = new Map<number, ParsePage>()

  for (const [index, page] of (raw.markdown?.pages ?? []).entries()) {
    const record = objectField(page)
    const pageNumber = readPageNumber(record, index + 1)
    const normalizedPage = ensurePage(pagesByNumber, pageNumber)
    if (page.success === false) {
      normalizedPage.warnings.push(pageWarning(record, "markdown_failed"))
      continue
    }
    const markdown = stringField(page.markdown)
    if (markdown) {
      normalizedPage.markdown = markdown
    }
  }

  for (const [index, page] of (raw.text?.pages ?? []).entries()) {
    const pageNumber = readPageNumber(objectField(page), index + 1)
    const normalizedPage = ensurePage(pagesByNumber, pageNumber)
    const text = stringField(page.text)
    if (text) {
      normalizedPage.text = text
    }
  }

  for (const [index, page] of (raw.metadata?.pages ?? []).entries()) {
    const pageNumber = readPageNumber(objectField(page), index + 1)
    const normalizedPage = ensurePage(pagesByNumber, pageNumber)
    normalizedPage.metadata = objectField(page)
  }

  const allTables: Array<ParsedTable> = []
  const allImages: Array<ParsedImage> = []

  for (const [index, page] of (raw.items?.pages ?? []).entries()) {
    const record = objectField(page)
    const pageNumber = readPageNumber(record, index + 1)
    const normalizedPage = ensurePage(pagesByNumber, pageNumber)

    if (page.success === false) {
      normalizedPage.warnings.push(pageWarning(record, "items_failed"))
      continue
    }

    const tables = collectItems(record, "table").map((item) => {
      const markdown = stringField(item.md)
      return {
        ...(markdown && { markdown }),
        pageNumber,
        ...(item.rows !== undefined && { rows: item.rows }),
      }
    })
    const images = collectItems(record, "image").map((item) => {
      const caption = stringField(item.caption)
      const url = stringField(item.url)
      return {
        ...(item.bbox !== undefined && { bbox: item.bbox }),
        ...(caption && { caption }),
        pageNumber,
        ...(url && { url }),
      }
    })

    normalizedPage.tables = tables
    normalizedPage.images = images
    allTables.push(...tables)
    allImages.push(...images)
  }

  for (const image of raw.images_content_metadata?.images ?? []) {
    const url = stringField(image.presigned_url)
    allImages.push({
      ...(image.bbox !== undefined && { bbox: image.bbox }),
      ...(url && { url }),
    })
  }

  const pages = Array.from(pagesByNumber.values()).sort(
    (left, right) => left.pageNumber - right.pageNumber
  )
  for (const page of pages) {
    warnings.push(...page.warnings)
  }

  const markdown = raw.markdown_full ?? joinPageField(pages, "markdown")
  const text = raw.text_full ?? joinPageField(pages, "text")

  const metadata = {
    ...raw.job_metadata,
    ...(raw.metadata && { llamaparseMetadata: raw.metadata }),
    ...(raw.result_content_metadata && {
      resultContentMetadata: raw.result_content_metadata,
    }),
  }
  const credits = numberField(raw.job_metadata?.credits)
  const usage: NonNullable<ParseResult["usage"]> = {
    ...(credits !== undefined && { credits }),
    ...(pages.length > 0 && { pages: pages.length }),
  }

  return {
    id: raw.job.id,
    outputs: selectOutputs(timing.outputs, {
      images: allImages,
      ...(raw.items !== undefined && raw.items !== null && { json: raw.items }),
      ...(markdown && { markdown }),
      metadata,
      pages,
      tables: allTables,
      ...(text && { text }),
    }),
    pageCount: pages.length,
    provider: "llamaparse",
    ...(includeRaw && { raw }),
    timing: {
      completedAt: timing.completedAt.toISOString(),
      durationMs: timing.durationMs,
      startedAt: timing.startedAt.toISOString(),
    },
    usage,
    warnings,
  }
}

const ensurePage = (
  pages: Map<number, ParsePage>,
  pageNumber: number
): ParsePage => {
  const page = pages.get(pageNumber)
  if (page) {
    return page
  }

  const nextPage = {
    pageNumber,
    warnings: [],
  }
  pages.set(pageNumber, nextPage)
  return nextPage
}

const readPageNumber = (
  page: Record<string, unknown>,
  fallback = 1
): number => {
  const value = page.page_number
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback
}

const pageWarning = (
  page: Record<string, unknown>,
  code: string
): ParseWarning => ({
  code,
  message: stringField(page.error) ?? "Provider reported a failed page.",
  pageNumber: readPageNumber(page),
})

const collectItems = (
  value: Record<string, unknown>,
  type: string
): Array<Record<string, unknown>> => {
  const found: Array<Record<string, unknown>> = []
  const items = Array.isArray(value.items) ? value.items : []

  for (const item of items) {
    if (!isRecord(item)) {
      continue
    }
    if (item.type === type) {
      found.push(item)
    }
    found.push(...collectItems(item, type))
  }

  return found
}

const joinPageField = (
  pages: Array<ParsePage>,
  field: "markdown" | "text"
): string | undefined => {
  const values = pages.flatMap((page) => {
    const value = page[field]
    return value ? [value] : []
  })
  return values.length > 0 ? values.join("\n\n---\n\n") : undefined
}

const stringField = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

const numberField = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const objectField = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {}
