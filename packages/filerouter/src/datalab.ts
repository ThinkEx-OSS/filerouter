import { FileRouterError } from "./errors"
import { readEnv, trimTrailingSlash } from "./internal/env"
import { isRecord, requestJson } from "./internal/http"
import { selectOutputs } from "./internal/outputs"
import { providerOptions } from "./internal/provider-options"
import { waitForProviderJob } from "./internal/polling"
import type {
  FileRouterProvider,
  ParsedImage,
  ParseOptions,
  ParseOutput,
  ParsePage,
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
export type DatalabOutputFormat = "chunks" | "html" | "json" | "markdown"

/** Per-request options named after Datalab's Convert API fields. */
export interface DatalabParseOptions {
  add_block_ids?: boolean
  additional_config?: string
  checkpoint_id?: string
  disable_image_captions?: boolean
  disable_image_extraction?: boolean
  extras?: string
  fence_synthetic_captions?: boolean
  format_lines?: boolean
  image_resolution?: number
  include_markdown_in_chunks?: boolean
  max_pages?: number
  mode?: DatalabMode
  output_format?: Array<DatalabOutputFormat> | string
  page_range?: string
  paginate?: boolean
  processing_region?: string
  raw?: Record<string, boolean | number | string>
  save_checkpoint?: boolean
  skip_cache?: boolean
  token_efficient_markdown?: boolean
  use_llm?: boolean
  webhook_url?: string
  word_bboxes?: boolean
}

interface DatalabSubmitResponse {
  error?: string | null
  request_check_url?: string
  request_id?: string
  success?: boolean
}

export function datalab(
  options: DatalabProviderOptions = {}
): FileRouterProvider<DatalabProviderOptions> {
  const jobs = datalabJobs(options)
  return {
    capabilities: {
      execution: "async",
      features: ["page-selection"],
      outputs: OUTPUTS,
    },
    id: PROVIDER_ID,
    jobs,
    name: "Datalab",
    parse: (input, parseOptions) =>
      parseDatalab(input, parseOptions, jobs, options.pollingIntervalMs),
    raw: options,
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
  const outputs = parseOptions.outputs ?? ["markdown"]
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

  const status = readString(raw.status)?.toLowerCase()
  if (status === "complete" || status === "completed") {
    return {
      result: normalizeDatalab(
        raw,
        job.id,
        parseOptions.outputs ?? ["markdown"],
        parseOptions.includeRaw === true,
        new Date(job.submittedAt)
      ),
      status: "complete",
    }
  }
  if (["cancelled", "error", "failed"].includes(status ?? "")) {
    return {
      error: readString(raw.error) ?? `Datalab job ${status}.`,
      status: "failed",
    }
  }
  return { status: status === "running" ? "running" : "pending" }
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

  for (const [key, value] of Object.entries({
    ...options.raw,
    ...raw,
    ...native,
  })) {
    if (key !== "file" && key !== "file_url" && key !== "output_format") {
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
  body.set(
    "output_format",
    nativeOutputFormats(nativeOptions.output_format, outputs).join(",")
  )
  if (parseOptions.pages) {
    body.set("page_range", parseOptions.pages.map((page) => page - 1).join(","))
  }

  return body
}

function normalizeDatalab(
  raw: Record<string, unknown>,
  id: string,
  requestedOutputs: Array<ParseOutput>,
  includeRaw: boolean,
  startedAt: Date
): ParseResult {
  const pages = readRecords(raw.pages).map(normalizePage)
  const markdown = readString(raw.markdown)
  const html = readString(raw.html)
  const json = raw.json
  const chunks = raw.chunks
  const images = normalizeImages(raw.images)
  const pageCount = readNumber(raw.page_count) ?? pages.length
  const qualityScore = readNumber(raw.parse_quality_score)
  const totalCost = readNumber(raw.total_cost)
  const completedAt = new Date()
  return {
    id,
    outputs: selectOutputs(requestedOutputs, {
      chunks,
      html,
      images,
      json,
      markdown,
      ...(isRecord(raw.metadata) && { metadata: raw.metadata }),
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

function normalizePage(raw: Record<string, unknown>, index: number): ParsePage {
  const html = readString(raw.html)
  const markdown = readString(raw.markdown)
  const text = readString(raw.text)

  return {
    ...(html && { html }),
    ...(raw.json !== undefined && { json: raw.json }),
    ...(markdown && { markdown }),
    ...(isRecord(raw.metadata) && { metadata: raw.metadata }),
    pageNumber: readNumber(raw.page_number) ?? index + 1,
    ...(text && { text }),
    warnings: [],
  }
}

function datalabOutputs(
  outputs: Array<ParseOutput>
): Array<DatalabOutputFormat> {
  const supported = new Set<string>()
  for (const output of outputs) {
    if (
      output === "chunks" ||
      output === "markdown" ||
      output === "html" ||
      output === "json"
    ) {
      supported.add(output)
    }
    if (["images", "metadata"].includes(output)) {
      supported.add("json")
    }
  }
  if (supported.size === 0) {
    supported.add("markdown")
  }
  return [...supported] as Array<DatalabOutputFormat>
}

function nativeOutputFormats(
  value: DatalabParseOptions["output_format"],
  outputs: Array<ParseOutput>
): Array<DatalabOutputFormat> {
  const native = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",").map((format) => format.trim())
      : []
  const supported = new Set<DatalabOutputFormat>(datalabOutputs(outputs))
  for (const format of native) {
    if (
      format !== "chunks" &&
      format !== "html" &&
      format !== "json" &&
      format !== "markdown"
    ) {
      throw new FileRouterError(
        `Unsupported Datalab output format: ${format}`,
        {
          code: "ParseFailed",
          providerId: PROVIDER_ID,
        }
      )
    }
    supported.add(format)
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
