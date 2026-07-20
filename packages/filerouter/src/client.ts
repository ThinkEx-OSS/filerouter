import { FileRouterError } from "./errors"
import {
  FILEROUTER_DEFAULT_API_URL,
  HOSTED_JOB_HEADERS,
  HOSTED_JOBS_PATH,
  MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES,
} from "./hosted"
import type { HostedJobAccepted, HostedJobResponse } from "./hosted"
import { readEnv, trimTrailingSlash } from "./internal/env"
import { requestJson } from "./internal/http"
import { resolveParseInput } from "./internal/input"
import { assertTimeoutMs } from "./internal/provider-options"
import { abortableSleep } from "./internal/sleep"
import { DEFAULT_PARSE_OUTPUT } from "./types"
import type {
  CompareOptions,
  CompareResult,
  ParseInput,
  ParseOptions,
  ParseResult,
} from "./types"

export interface FileRouterClientOptions {
  apiKey?: string
  baseURL?: string
  fetch?: typeof globalThis.fetch
  pollingIntervalMs?: number
}

export interface HostedParseOptions extends ParseOptions {
  idempotencyKey?: string
}

export interface HostedCompareOptions extends CompareOptions {
  idempotencyKey?: string
}

interface JobRequest {
  operation: "compare" | "parse"
  includeRaw?: boolean
  outputs: Array<string>
  pages?: Array<number>
  provider?: string
  providerOptions?: ParseOptions["providerOptions"]
  providers?: Array<string>
}

export class FileRouterClient {
  readonly #apiKey: string
  readonly #baseURL: string
  readonly #fetch: typeof globalThis.fetch | undefined
  readonly #pollingIntervalMs: number

  constructor(options: FileRouterClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("FILEROUTER_API_KEY")
    if (!apiKey) {
      throw new FileRouterError("FileRouter requires FILEROUTER_API_KEY.", {
        code: "Auth",
      })
    }

    this.#apiKey = apiKey
    this.#baseURL = trimTrailingSlash(
      options.baseURL ??
        readEnv("FILEROUTER_API_URL") ??
        FILEROUTER_DEFAULT_API_URL
    )
    this.#fetch = options.fetch
    this.#pollingIntervalMs = options.pollingIntervalMs ?? 1000
  }

  async parse(
    input: ParseInput,
    options: HostedParseOptions = {}
  ): Promise<ParseResult> {
    return this.#runJob<ParseResult>(
      input,
      {
        operation: "parse",
        ...(options.includeRaw !== undefined && {
          includeRaw: options.includeRaw,
        }),
        outputs: options.outputs ?? [DEFAULT_PARSE_OUTPUT],
        ...(options.pages && { pages: options.pages }),
        ...(options.provider && { provider: options.provider }),
        ...(options.providerOptions && {
          providerOptions: options.providerOptions,
        }),
      },
      options
    )
  }

  async compare(
    input: ParseInput,
    options: HostedCompareOptions = {}
  ): Promise<CompareResult> {
    return this.#runJob<CompareResult>(
      input,
      {
        operation: "compare",
        ...(options.includeRaw !== undefined && {
          includeRaw: options.includeRaw,
        }),
        outputs: options.outputs ?? [DEFAULT_PARSE_OUTPUT],
        ...(options.pages && { pages: options.pages }),
        ...(options.providerOptions && {
          providerOptions: options.providerOptions,
        }),
        ...(options.providers && { providers: options.providers }),
      },
      options
    )
  }

  async #runJob<Result>(
    input: ParseInput,
    request: JobRequest,
    options: {
      idempotencyKey?: string
      signal?: AbortSignal
      timeoutMs?: number
    }
  ): Promise<Result> {
    const timeoutController = new AbortController()
    const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000
    assertTimeoutMs(timeoutMs)
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs)
    if (timeoutMs <= 0) {
      timeoutController.abort()
    }
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutController.signal])
      : timeoutController.signal

    try {
      const job = await this.#createJob(
        input,
        request,
        signal,
        options.idempotencyKey
      )
      return await this.#waitForJob<Result>(job.id, signal)
    } catch (error) {
      if (timeoutController.signal.aborted && !options.signal?.aborted) {
        throw new FileRouterError("FileRouter job timed out.", {
          code: "Timeout",
        })
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  async #createJob(
    input: ParseInput,
    request: JobRequest,
    signal: AbortSignal,
    idempotencyKey: string = crypto.randomUUID()
  ): Promise<HostedJobAccepted> {
    const serializedProviderOptions = request.providerOptions
      ? stringifyJson(request.providerOptions, "Hosted provider options")
      : undefined
    const resolved = await resolveParseInput(input, signal)
    const headers = this.#headers()
    headers.set("Idempotency-Key", idempotencyKey)
    let body: BodyInit

    if (resolved.kind === "url") {
      headers.set("Content-Type", "application/json")
      body = stringifyJson(
        { ...request, source: { url: resolved.url } },
        "Hosted job request"
      )
    } else {
      headers.set("Content-Type", "application/octet-stream")
      headers.set(HOSTED_JOB_HEADERS.contentType, resolved.mimeType)
      headers.set(
        HOSTED_JOB_HEADERS.fileName,
        encodeURIComponent(resolved.name)
      )
      headers.set(HOSTED_JOB_HEADERS.operation, request.operation)
      headers.set(HOSTED_JOB_HEADERS.outputs, request.outputs.join(","))
      if (request.pages) {
        headers.set(HOSTED_JOB_HEADERS.pages, request.pages.join(","))
      }
      if (request.includeRaw !== undefined) {
        headers.set(HOSTED_JOB_HEADERS.includeRaw, String(request.includeRaw))
      }
      if (serializedProviderOptions !== undefined) {
        const encodedProviderOptions = encodeURIComponent(
          serializedProviderOptions
        )
        if (
          encodedProviderOptions.length >
          MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES
        ) {
          throw new FileRouterError(
            `Hosted provider options exceed the ${MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES / 1024} KiB header limit.`,
            { code: "InvalidInput" }
          )
        }
        headers.set(HOSTED_JOB_HEADERS.providerOptions, encodedProviderOptions)
      }
      if (request.provider) {
        headers.set(HOSTED_JOB_HEADERS.provider, request.provider)
      }
      if (request.providers) {
        headers.set(HOSTED_JOB_HEADERS.providers, request.providers.join(","))
      }
      body = resolved.data
    }

    return requestJson<HostedJobAccepted>(
      `${this.#baseURL}${HOSTED_JOBS_PATH}`,
      {
        body,
        fetch: this.#fetch,
        headers,
        method: "POST",
        providerId: "filerouter",
        signal,
      }
    )
  }

  async #waitForJob<Result>(id: string, signal: AbortSignal): Promise<Result> {
    while (true) {
      const job = await requestJson<HostedJobResponse<Result>>(
        `${this.#baseURL}${HOSTED_JOBS_PATH}/${encodeURIComponent(id)}`,
        {
          fetch: this.#fetch,
          headers: this.#headers(),
          providerId: "filerouter",
          signal,
        }
      )

      if (job.status === "complete") {
        return job.result
      }
      if (job.status === "failed") {
        throw new FileRouterError(job.error, { code: "ParseFailed" })
      }
      await abortableSleep(this.#pollingIntervalMs, signal)
    }
  }

  #headers(): Headers {
    return new Headers({ Authorization: `Bearer ${this.#apiKey}` })
  }
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
