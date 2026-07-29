import { FileRouterError } from "./errors"
import { readEnv, trimTrailingSlash } from "./internal/env"
import { requestJson } from "./internal/http"
import { selectOutputs } from "./internal/outputs"
import { providerOptions } from "./internal/provider-options"
import { waitForProviderJob } from "./internal/polling"
import { isRecord } from "./internal/record"
import { DEFAULT_PARSE_OUTPUT } from "./types"
import type {
  FileRouterProvider,
  ParsedImage,
  ParseOptions,
  ParseOutput,
  ParsePage,
  ParsePageField,
  ParseResult,
  ProviderJobReference,
  ProviderJobs,
  ProviderJobStatus,
  ProviderInput,
} from "./types"

const PROVIDER_ID = "datalab"
const DEFAULT_BASE_URL = "https://www.datalab.to/api/v1"
const OUTPUTS = [
  "chunks",
  "html",
  "images",
  "json",
  "markdown",
  "metadata",
  "pages",
] satisfies Array<ParseOutput>

export interface DatalabProviderOptions {
  apiKey?: string
  baseURL?: string
  fetch?: typeof globalThis.fetch
  mode?: DatalabMode
  pollingIntervalMs?: number
  raw?: Record<string, boolean | number | string>
}

export type DatalabMode = "accurate" | "balanced" | "fast"
type DatalabOutputFormat = "chunks" | "html" | "json" | "markdown"

/** Per-request options named after Datalab's Convert API fields. */
export interface DatalabParseOptions {
  add_block_ids?: boolean
  additional_config?: string
  disable_image_captions?: boolean
  disable_image_extraction?: boolean
  eval_rubric_id?: number
  extras?: string
  fence_synthetic_captions?: boolean
  include_markdown_in_chunks?: boolean
  max_pages?: number
  mode?: DatalabMode
  model_override_settings?: string
  paginate?: boolean
  processing_location?: string
  raw?: Record<string, boolean | number | string>
  save_checkpoint?: boolean
  skip_cache?: boolean
  token_efficient_markdown?: boolean
  webhook_url?: string
  word_bboxes?: boolean
  workflowstepdata_id?: number
}

interface DatalabSubmitResponse {
  error?: string | null
  request_check_url?: string
  request_id?: string
  success?: boolean
}

export function datalab(
  options: DatalabProviderOptions = {}
): FileRouterProvider {
  const jobs = datalabJobs(options)
  return {
    capabilities: {
      execution: "async",
      features: ["page-selection"],
      outputs: OUTPUTS,
      pageFields: ["html", "json", "markdown", "metadata"],
    },
    id: PROVIDER_ID,
    jobs,
    name: "Datalab",
    parse: (input, parseOptions) =>
      parseDatalab(input, parseOptions, jobs, options.pollingIntervalMs),
  }
}

async function parseDatalab(
  input: ProviderInput,
  parseOptions: ParseOptions,
  jobs: ProviderJobs,
  pollingIntervalMs?: number
): Promise<ParseResult> {
  const job = await jobs.submit(input, parseOptions)
  return waitForProviderJob(
    PROVIDER_ID,
    jobs,
    job,
    parseOptions,
    pollingIntervalMs
  )
}

function datalabJobs(options: DatalabProviderOptions): ProviderJobs {
  return {
    get: (job, parseOptions) => getDatalabJob(job, parseOptions, options),
    submit: (input, parseOptions) =>
      submitDatalab(input, parseOptions, options),
  }
}

async function submitDatalab(
  input: ProviderInput,
  parseOptions: ParseOptions,
  options: DatalabProviderOptions
): Promise<ProviderJobReference> {
  const submittedAt = new Date().toISOString()
  const apiKey = options.apiKey ?? readEnv("DATALAB_API_KEY")
  if (!apiKey) {
    throw new FileRouterError("Datalab requires DATALAB_API_KEY.", {
      code: "Auth",
      providerId: PROVIDER_ID,
    })
  }

  const baseURL = trimTrailingSlash(options.baseURL ?? DEFAULT_BASE_URL)
  const outputs = parseOptions.outputs ?? [DEFAULT_PARSE_OUTPUT]
  const body = await createFormData(input, outputs, parseOptions, options)
  const submitted = await requestJson<DatalabSubmitResponse>(
    `${baseURL}/convert`,
    {
      body,
      fetch: options.fetch,
      headers: { "X-API-Key": apiKey },
      method: "POST",
      providerId: PROVIDER_ID,
      ...(parseOptions.signal && { signal: parseOptions.signal }),
    }
  )

  assertSuccessful(submitted)
  if (!submitted.request_check_url || !submitted.request_id) {
    throw new FileRouterError("Datalab returned an invalid job response.", {
      code: "ParseFailed",
      providerId: PROVIDER_ID,
    })
  }

  const checkUrl = validateCheckUrl(submitted.request_check_url, baseURL)
  return {
    id: submitted.request_id,
    state: { checkUrl },
    submittedAt,
  }
}

async function getDatalabJob(
  job: ProviderJobReference,
  parseOptions: ParseOptions,
  options: DatalabProviderOptions
): Promise<ProviderJobStatus> {
  const apiKey = options.apiKey ?? readEnv("DATALAB_API_KEY")
  if (!apiKey) {
    throw new FileRouterError("Datalab requires DATALAB_API_KEY.", {
      code: "Auth",
      providerId: PROVIDER_ID,
    })
  }
  const checkUrl = job.state?.checkUrl
  if (typeof checkUrl !== "string") {
    throw new FileRouterError("Datalab job is missing its status URL.", {
      code: "ParseFailed",
      providerId: PROVIDER_ID,
    })
  }

  const raw = await requestJson<Record<string, unknown>>(checkUrl, {
    fetch: options.fetch,
    headers: { "X-API-Key": apiKey },
    providerId: PROVIDER_ID,
    ...(parseOptions.signal && { signal: parseOptions.signal }),
  })
  assertSuccessful(raw)

  const status = readString(raw.status)
  if (status === "complete") {
    return {
      result: normalizeDatalab(
        raw,
        job.id,
        parseOptions.outputs ?? [DEFAULT_PARSE_OUTPUT],
        parseOptions.pageFields,
        parseOptions.includeRaw === true,
        new Date(job.submittedAt)
      ),
      status: "complete",
    }
  }
  if (status === "failed") {
    return {
      error: readString(raw.error) ?? "Datalab job failed.",
      status: "failed",
    }
  }
  if (status === "processing") {
    return { status: "running" }
  }
  throw datalabParseError("Datalab returned an invalid job status.")
}

async function createFormData(
  input: ProviderInput,
  outputs: Array<ParseOutput>,
  parseOptions: ParseOptions,
  options: DatalabProviderOptions
): Promise<FormData> {
  const body = new FormData()
  const nativeOptions = providerOptions<DatalabParseOptions>(
    parseOptions,
    PROVIDER_ID
  )
  const { raw, ...native } = nativeOptions
  const nativeFields = {
    ...options.raw,
    ...raw,
    ...native,
  }

  for (const [key, value] of Object.entries(nativeFields)) {
    if (
      value !== undefined &&
      value !== null &&
      key !== "file" &&
      key !== "file_url" &&
      key !== "output_format" &&
      key !== "page_range"
    ) {
      body.set(key, formValue(value))
    }
  }

  if (input.kind === "url") {
    body.set("file_url", input.url)
  } else {
    body.set("file", input.data, input.name)
  }

  const mode = nativeOptions.mode ?? options.mode
  if (mode) {
    body.set("mode", mode)
  }
  body.set("output_format", datalabOutputs(outputs).join(","))
  if (
    outputs.includes("pages") &&
    (parseOptions.pageFields === undefined ||
      parseOptions.pageFields.includes("markdown")) &&
    nativeFields.include_markdown_in_chunks === undefined
  ) {
    body.set("include_markdown_in_chunks", "true")
  }
  if (parseOptions.pages) {
    body.set("page_range", parseOptions.pages.map((page) => page - 1).join(","))
  }

  return body
}

function normalizeDatalab(
  raw: Record<string, unknown>,
  id: string,
  requestedOutputs: Array<ParseOutput>,
  requestedPageFields: Array<ParsePageField> | undefined,
  includeRaw: boolean,
  startedAt: Date
): ParseResult {
  const pagesRequested = requestedOutputs.includes("pages")
  const pageBlocks = datalabPageBlocks(raw.json, pagesRequested)
  const pages = pagesRequested
    ? pageBlocks.map((page) => normalizePage(page, requestedPageFields))
    : []
  const markdown = readString(raw.markdown)
  const html = readString(raw.html)
  const json = raw.json
  const chunks = raw.chunks
  const images = normalizeImages(raw.images)
  const pageCount = readNumber(raw.page_count) ?? pageBlocks.length
  const qualityScore = readNumber(raw.parse_quality_score)
  const costBreakdown = isRecord(raw.cost_breakdown)
    ? raw.cost_breakdown
    : undefined
  const totalCost = readNumber(costBreakdown?.total)
  const metadata = {
    ...(isRecord(raw.metadata) ? raw.metadata : {}),
    ...(typeof raw.checkpoint_id === "string" && {
      checkpointId: raw.checkpoint_id,
    }),
    ...(costBreakdown && { costBreakdown }),
    ...(typeof raw.output_format === "string" && {
      outputFormat: raw.output_format,
    }),
    ...(isRecord(raw.versions) && { versions: raw.versions }),
  }
  const completedAt = new Date()
  return {
    id,
    outputs: selectOutputs(requestedOutputs, {
      chunks,
      html,
      images,
      json,
      markdown,
      metadata,
      pages,
    }),
    pageCount,
    provider: PROVIDER_ID,
    ...(qualityScore !== undefined && {
      quality: { score: qualityScore, scale: 5 },
    }),
    ...(includeRaw && { raw }),
    timing: {
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
    },
    usage: {
      ...(totalCost !== undefined && {
        costUsd: totalCost / 100,
      }),
      pages: pageCount,
    },
    warnings: [],
  }
}

function datalabPageBlocks(
  value: unknown,
  required: boolean
): Array<Record<string, unknown>> {
  if (!isRecord(value)) {
    if (required) {
      throw datalabParseError("Datalab did not return JSON page output.")
    }
    return []
  }
  return readRecords(value.children).filter(
    (block) => block.block_type === "Page"
  )
}

function normalizePage(
  raw: Record<string, unknown>,
  requestedFields: Array<ParsePageField> | undefined
): ParsePage {
  const blocks = indexDatalabBlocks(raw)
  const allFields = requestedFields === undefined
  const html =
    allFields || requestedFields.includes("html")
      ? resolveBlockField(raw, "html", blocks)
      : undefined
  const markdown =
    allFields || requestedFields.includes("markdown")
      ? resolveBlockField(raw, "markdown", blocks)
      : undefined
  const json = allFields || requestedFields.includes("json") ? raw : undefined
  const metadata =
    allFields || requestedFields.includes("metadata")
      ? {
          ...(raw.bbox !== undefined && { bbox: raw.bbox }),
          ...(typeof raw.id === "string" && { blockId: raw.id }),
          ...(raw.polygon !== undefined && { polygon: raw.polygon }),
          ...(raw.section_hierarchy !== undefined && {
            sectionHierarchy: raw.section_hierarchy,
          }),
        }
      : undefined

  return {
    ...(html && { html }),
    ...(json && { json }),
    ...(markdown && { markdown }),
    ...(metadata && Object.keys(metadata).length > 0 && { metadata }),
    pageNumber: datalabPageNumber(raw),
    warnings: [],
  }
}

function datalabPageNumber(page: Record<string, unknown>): number {
  const id = readString(page.id)
  const zeroBased = id?.match(/(?:^|\/)page\/(\d+)(?:\/|$)/i)?.[1]
  const pageNumber = zeroBased === undefined ? NaN : Number(zeroBased) + 1
  if (!Number.isSafeInteger(pageNumber) || pageNumber <= 0) {
    throw datalabParseError("Datalab returned a page with an invalid ID.")
  }
  return pageNumber
}

function indexDatalabBlocks(
  root: Record<string, unknown>
): Map<string, Record<string, unknown>> {
  const blocks = new Map<string, Record<string, unknown>>()
  const pending = [root]
  while (pending.length > 0) {
    const block = pending.pop()
    if (!block) {
      continue
    }
    const id = readString(block.id)
    if (id) {
      blocks.set(id, block)
    }
    pending.push(...readRecords(block.children))
  }
  return blocks
}

function resolveBlockField(
  root: Record<string, unknown>,
  field: "html" | "markdown",
  blocks: Map<string, Record<string, unknown>>
): string | undefined {
  const rootId = readString(root.id)
  const visiting = new Set(rootId ? [rootId] : [])
  const resolve = (block: Record<string, unknown>): string | undefined => {
    const value = readString(block[field])
    if (!value) {
      return undefined
    }
    return value.replace(
      /<content-ref\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>\s*<\/content-ref>/gi,
      (_reference, _quote: string, childId: string) => {
        const child = blocks.get(childId)
        if (!child) {
          throw datalabParseError(
            `Datalab page references a missing block: ${childId}.`
          )
        }
        if (visiting.has(childId)) {
          throw datalabParseError(
            `Datalab page contains a cyclic block reference: ${childId}.`
          )
        }
        visiting.add(childId)
        const resolved = resolve(child)
        visiting.delete(childId)
        if (resolved === undefined) {
          throw datalabParseError(
            `Datalab block is missing ${field}: ${childId}.`
          )
        }
        return resolved
      }
    )
  }
  return resolve(root)
}

function datalabParseError(message: string): FileRouterError {
  return new FileRouterError(message, {
    code: "ParseFailed",
    providerId: PROVIDER_ID,
  })
}

function datalabOutputs(
  outputs: Array<ParseOutput>
): Array<DatalabOutputFormat> {
  const supported = new Set<DatalabOutputFormat>()
  for (const output of outputs) {
    if (
      output === "chunks" ||
      output === "markdown" ||
      output === "html" ||
      output === "json"
    ) {
      supported.add(output)
    }
    if (output === "images" || output === "metadata" || output === "pages") {
      supported.add("json")
    }
  }
  if (supported.size === 0) {
    supported.add(DEFAULT_PARSE_OUTPUT)
  }
  return [...supported]
}

function normalizeImages(value: unknown): Array<ParsedImage> {
  if (!isRecord(value)) {
    return []
  }
  return Object.entries(value).flatMap(([name, data]) => {
    if (typeof data !== "string") {
      return []
    }
    const mimeType = mimeTypeForName(name)
    return [
      {
        data,
        id: name,
        ...(mimeType && { mimeType }),
        name,
      },
    ]
  })
}

function mimeTypeForName(name: string): string | undefined {
  const extension = name.split(".").pop()?.toLowerCase()
  return extension && ["gif", "jpeg", "jpg", "png", "webp"].includes(extension)
    ? `image/${extension === "jpg" ? "jpeg" : extension}`
    : undefined
}

function formValue(value: unknown): string {
  return typeof value === "string" ? value : String(value)
}

function validateCheckUrl(value: string, baseURL: string): string {
  const checkUrl = new URL(value)
  const configuredUrl = new URL(baseURL)
  const allowed =
    checkUrl.origin === configuredUrl.origin ||
    (configuredUrl.hostname.endsWith("datalab.to") &&
      checkUrl.hostname.endsWith("datalab.to") &&
      checkUrl.protocol === "https:")

  if (!allowed) {
    throw new FileRouterError("Datalab returned an untrusted job URL.", {
      code: "ParseFailed",
      providerId: PROVIDER_ID,
    })
  }
  return checkUrl.toString()
}

function assertSuccessful(value: unknown): void {
  if (isRecord(value) && value.success === false) {
    throw new FileRouterError(
      readString(value.error) ?? "Datalab request failed.",
      { code: "ParseFailed", providerId: PROVIDER_ID }
    )
  }
}

function readRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
