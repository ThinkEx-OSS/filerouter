import { FileRouterError } from "./errors"
import {
  HOSTED_JOB_HEADERS,
  HOSTED_JOBS_PATH,
  MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES,
} from "./hosted"
import type {
  HostedCompareJob,
  HostedJob,
  HostedJobAccepted,
  HostedJobHandle,
  HostedJobOperation,
  HostedJobResponse,
  HostedParseJob,
} from "./hosted"
import { requestJson } from "./internal/http"
import { resolveParseInput } from "./internal/input"
import { abortableSleep } from "./internal/sleep"
import { withTimeout } from "./internal/timeout"
import { DEFAULT_PARSE_OUTPUT } from "./types"
import type {
  CompareOptions,
  CompareResult,
  ParseInput,
  ParseOptions,
  ParseOutput,
  ParseResult,
} from "./types"

export const DEFAULT_HOSTED_JOB_TIMEOUT_MS = 10 * 60 * 1000

const MAX_TRANSIENT_ATTEMPTS = 3
const INITIAL_RETRY_DELAY_MS = 250
const MAX_RETRY_DELAY_MS = 10_000

export interface HostedParseOptions extends ParseOptions {
  idempotencyKey?: string
}

export interface HostedCompareOptions extends CompareOptions {
  idempotencyKey?: string
}

export interface HostedParseJobOptions extends Omit<
  HostedParseOptions,
  "timeoutMs"
> {
  operation?: "parse"
}

export interface HostedCompareJobOptions extends Omit<
  HostedCompareOptions,
  "timeoutMs"
> {
  operation: "compare"
}

export interface HostedJobGetOptions {
  signal?: AbortSignal
}

export interface HostedJobWaitOptions<
  Result = ParseResult | CompareResult,
> extends HostedJobGetOptions {
  onStatus?: (job: HostedJobResponse<Result>) => void
  timeoutMs?: number
}

type HostedResultFor<Operation extends HostedJobOperation> =
  Operation extends "parse" ? ParseResult : CompareResult

export interface FileRouterJobs {
  create(
    input: ParseInput,
    options?: HostedParseJobOptions
  ): Promise<HostedParseJob>
  create(
    input: ParseInput,
    options: HostedCompareJobOptions
  ): Promise<HostedCompareJob>

  get<Operation extends HostedJobOperation>(
    job: HostedJobHandle<Operation>,
    options?: HostedJobGetOptions
  ): Promise<HostedJobResponse<HostedResultFor<Operation>>>
  get<Result = ParseResult | CompareResult>(
    id: string,
    options?: HostedJobGetOptions
  ): Promise<HostedJobResponse<Result>>

  wait<Operation extends HostedJobOperation>(
    job: HostedJobHandle<Operation>,
    options?: HostedJobWaitOptions<HostedResultFor<Operation>>
  ): Promise<HostedResultFor<Operation>>
  wait<Result = ParseResult | CompareResult>(
    id: string,
    options?: HostedJobWaitOptions<Result>
  ): Promise<Result>
}

interface HostedJobsOptions {
  apiKey: string
  baseURL: string
  fetch?: typeof globalThis.fetch
  pollingIntervalMs?: number
}

interface JobRequest {
  operation: "compare" | "parse"
  includeRaw?: boolean
  outputs: Array<ParseOutput>
  pages?: Array<number>
  provider?: string
  providerOptions?: ParseOptions["providerOptions"]
  providers?: Array<string>
}

export class HostedJobs implements FileRouterJobs {
  readonly #apiKey: string
  readonly #baseURL: string
  readonly #fetch: typeof globalThis.fetch | undefined
  readonly #pollingIntervalMs: number

  constructor(options: HostedJobsOptions) {
    this.#apiKey = options.apiKey
    this.#baseURL = options.baseURL
    this.#fetch = options.fetch
    this.#pollingIntervalMs = options.pollingIntervalMs ?? 1000
  }

  create(
    input: ParseInput,
    options?: HostedParseJobOptions
  ): Promise<HostedParseJob>
  create(
    input: ParseInput,
    options: HostedCompareJobOptions
  ): Promise<HostedCompareJob>
  async create(
    input: ParseInput,
    options: HostedParseJobOptions | HostedCompareJobOptions = {}
  ): Promise<HostedJob> {
    const idempotencyKey = options.idempotencyKey ?? crypto.randomUUID()
    const request = createJobRequest(options)
    const resolved = await resolveParseInput(input, options.signal)
    const headers = this.#headers()
    headers.set("Idempotency-Key", idempotencyKey)
    const body = createRequestBody(headers, resolved, request)

    const accepted = await retryTransient(
      () =>
        requestJson<HostedJobAccepted>(`${this.#baseURL}${HOSTED_JOBS_PATH}`, {
          body,
          headers,
          method: "POST",
          providerId: "filerouter",
          ...(this.#fetch && { fetch: this.#fetch }),
          ...(options.signal && { signal: options.signal }),
        }),
      options.signal
    )

    return { ...accepted, idempotencyKey, operation: request.operation }
  }

  get<Operation extends HostedJobOperation>(
    job: HostedJobHandle<Operation>,
    options?: HostedJobGetOptions
  ): Promise<HostedJobResponse<HostedResultFor<Operation>>>
  get<Result = ParseResult | CompareResult>(
    id: string,
    options?: HostedJobGetOptions
  ): Promise<HostedJobResponse<Result>>
  get<Result = ParseResult | CompareResult>(
    job: HostedJob | string,
    options: HostedJobGetOptions = {}
  ): Promise<HostedJobResponse<Result>> {
    return this.#get(jobId(job), options.signal)
  }

  wait<Operation extends HostedJobOperation>(
    job: HostedJobHandle<Operation>,
    options?: HostedJobWaitOptions<HostedResultFor<Operation>>
  ): Promise<HostedResultFor<Operation>>
  wait<Result = ParseResult | CompareResult>(
    id: string,
    options?: HostedJobWaitOptions<Result>
  ): Promise<Result>
  wait<Result = ParseResult | CompareResult>(
    job: HostedJob | string,
    options: HostedJobWaitOptions<Result> = {}
  ): Promise<Result> {
    return withTimeout(
      options.timeoutMs ?? DEFAULT_HOSTED_JOB_TIMEOUT_MS,
      options.signal,
      (signal) => this.#wait(jobId(job), signal, options.onStatus)
    )
  }

  async #get<Result>(
    id: string,
    signal?: AbortSignal
  ): Promise<HostedJobResponse<Result>> {
    return requestJson<HostedJobResponse<Result>>(
      `${this.#baseURL}${HOSTED_JOBS_PATH}/${encodeURIComponent(id)}`,
      {
        headers: this.#headers(),
        providerId: "filerouter",
        ...(this.#fetch && { fetch: this.#fetch }),
        ...(signal && { signal }),
      }
    )
  }

  async #wait<Result>(
    id: string,
    signal: AbortSignal,
    onStatus?: (job: HostedJobResponse<Result>) => void
  ): Promise<Result> {
    let previousStatus: HostedJobResponse<Result>["status"] | undefined

    while (true) {
      const job = await retryTransient(
        () => this.#get<Result>(id, signal),
        signal
      )

      if (job.status !== previousStatus) {
        onStatus?.(job)
        previousStatus = job.status
      }
      if (job.status === "complete") {
        return job.result
      }
      if (job.status === "failed") {
        throw new FileRouterError(job.error, {
          code: "ParseFailed",
          providerId: "filerouter",
        })
      }
      await abortableSleep(this.#pollingIntervalMs, signal)
    }
  }

  #headers(): Headers {
    return new Headers({ Authorization: `Bearer ${this.#apiKey}` })
  }
}

function createJobRequest(
  options: HostedParseJobOptions | HostedCompareJobOptions
): JobRequest {
  const operation = options.operation ?? "parse"
  const request: JobRequest = {
    operation,
    outputs: options.outputs ?? [DEFAULT_PARSE_OUTPUT],
    ...(options.includeRaw !== undefined && {
      includeRaw: options.includeRaw,
    }),
    ...(options.pages && { pages: options.pages }),
    ...(options.providerOptions && {
      providerOptions: options.providerOptions,
    }),
  }

  if (options.operation === "compare") {
    return {
      ...request,
      ...(options.providers && { providers: options.providers }),
    }
  }

  return {
    ...request,
    ...(options.provider && { provider: options.provider }),
  }
}

function createRequestBody(
  headers: Headers,
  input: Awaited<ReturnType<typeof resolveParseInput>>,
  request: JobRequest
): BodyInit {
  if (input.kind === "url") {
    headers.set("Content-Type", "application/json")
    return stringifyJson(
      { ...request, source: { url: input.url } },
      "Hosted job request"
    )
  }

  headers.set("Content-Type", "application/octet-stream")
  headers.set(HOSTED_JOB_HEADERS.contentType, input.mimeType)
  headers.set(HOSTED_JOB_HEADERS.fileName, encodeURIComponent(input.name))
  headers.set(HOSTED_JOB_HEADERS.operation, request.operation)
  headers.set(HOSTED_JOB_HEADERS.outputs, request.outputs.join(","))
  if (request.pages) {
    headers.set(HOSTED_JOB_HEADERS.pages, request.pages.join(","))
  }
  if (request.includeRaw !== undefined) {
    headers.set(HOSTED_JOB_HEADERS.includeRaw, String(request.includeRaw))
  }
  if (request.providerOptions) {
    const providerOptions = encodeURIComponent(
      stringifyJson(request.providerOptions, "Hosted provider options")
    )
    if (providerOptions.length > MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES) {
      throw new FileRouterError(
        `Hosted provider options exceed the ${MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES / 1024} KiB header limit.`,
        { code: "InvalidInput" }
      )
    }
    headers.set(HOSTED_JOB_HEADERS.providerOptions, providerOptions)
  }
  if (request.provider) {
    headers.set(HOSTED_JOB_HEADERS.provider, request.provider)
  }
  if (request.providers) {
    headers.set(HOSTED_JOB_HEADERS.providers, request.providers.join(","))
  }
  return input.data
}

async function retryTransient<Result>(
  operation: () => Promise<Result>,
  signal?: AbortSignal
): Promise<Result> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (
        attempt >= MAX_TRANSIENT_ATTEMPTS ||
        !FileRouterError.isInstance(error) ||
        !error.retryable
      ) {
        throw error
      }

      await abortableSleep(retryDelay(error, attempt), signal)
    }
  }
}

function retryDelay(error: FileRouterError, attempt: number): number {
  if (error.retryAfterMs !== undefined) {
    return error.retryAfterMs
  }
  const ceiling = Math.min(
    INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1),
    MAX_RETRY_DELAY_MS
  )
  return Math.round(ceiling * (0.5 + Math.random() * 0.5))
}

function jobId(job: HostedJob | string): string {
  return typeof job === "string" ? job : job.id
}

function stringifyJson(value: unknown, label: string): string {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) {
      throw new TypeError("Value is not JSON serializable.")
    }
    return serialized
  } catch (cause) {
    throw new FileRouterError(`${label} could not be serialized as JSON.`, {
      cause,
      code: "InvalidInput",
    })
  }
}
