import { FileRouterError } from "./errors"
import { readEnv, trimTrailingSlash } from "./internal/env"
import { requestJson } from "./internal/http"
import { resolveParseInput } from "./internal/input"
import { abortableSleep } from "./internal/sleep"
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

interface JobAccepted {
  id: string
  status: "complete" | "failed" | "queued" | "running"
}

type JobResponse<Result> =
  | { error: string; id: string; status: "failed" }
  | { id: string; result: Result; status: "complete" }
  | { id: string; status: "queued" | "running" }

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
        "https://filerouter.dev"
    )
    this.#fetch = options.fetch
    this.#pollingIntervalMs = options.pollingIntervalMs ?? 1000
  }

  async parse(
    input: ParseInput,
    options: HostedParseOptions = {}
  ): Promise<ParseResult> {
    const job = await this.#createJob(
      input,
      {
        operation: "parse",
        ...(options.includeRaw !== undefined && {
          includeRaw: options.includeRaw,
        }),
        outputs: options.outputs ?? ["markdown"],
        ...(options.pages && { pages: options.pages }),
        ...(options.provider && { provider: options.provider }),
        ...(options.providerOptions && {
          providerOptions: options.providerOptions,
        }),
      },
      options.idempotencyKey
    )
    return this.#waitForJob<ParseResult>(job.id, options)
  }

  async compare(
    input: ParseInput,
    options: HostedCompareOptions = {}
  ): Promise<CompareResult> {
    const job = await this.#createJob(
      input,
      {
        operation: "compare",
        ...(options.includeRaw !== undefined && {
          includeRaw: options.includeRaw,
        }),
        outputs: options.outputs ?? ["markdown"],
        ...(options.pages && { pages: options.pages }),
        ...(options.providerOptions && {
          providerOptions: options.providerOptions,
        }),
        ...(options.providers && { providers: options.providers }),
      },
      options.idempotencyKey
    )
    return this.#waitForJob<CompareResult>(job.id, options)
  }

  async #createJob(
    input: ParseInput,
    request: {
      operation: "compare" | "parse"
      includeRaw?: boolean
      outputs: Array<string>
      pages?: Array<number>
      provider?: string
      providerOptions?: ParseOptions["providerOptions"]
      providers?: Array<string>
    },
    idempotencyKey: string = crypto.randomUUID()
  ): Promise<JobAccepted> {
    const resolved = await resolveParseInput(input)
    const headers = this.#headers()
    headers.set("Idempotency-Key", idempotencyKey)
    let body: BodyInit

    if (resolved.kind === "url") {
      headers.set("Content-Type", "application/json")
      body = JSON.stringify({ ...request, source: { url: resolved.url } })
    } else {
      headers.set("Content-Type", resolved.mimeType)
      headers.set("X-FileRouter-Filename", encodeURIComponent(resolved.name))
      headers.set("X-FileRouter-Operation", request.operation)
      headers.set("X-FileRouter-Outputs", request.outputs.join(","))
      if (request.pages) {
        headers.set("X-FileRouter-Pages", request.pages.join(","))
      }
      if (request.includeRaw !== undefined) {
        headers.set("X-FileRouter-Include-Raw", String(request.includeRaw))
      }
      if (request.providerOptions) {
        headers.set(
          "X-FileRouter-Provider-Options",
          encodeURIComponent(JSON.stringify(request.providerOptions))
        )
      }
      if (request.provider) {
        headers.set("X-FileRouter-Provider", request.provider)
      }
      if (request.providers) {
        headers.set("X-FileRouter-Providers", request.providers.join(","))
      }
      body = resolved.data
    }

    return requestJson<JobAccepted>(`${this.#baseURL}/api/v1/jobs`, {
      body,
      fetch: this.#fetch,
      headers,
      method: "POST",
      providerId: "filerouter",
    })
  }

  async #waitForJob<Result>(
    id: string,
    options: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<Result> {
    const deadline = Date.now() + (options.timeoutMs ?? 10 * 60 * 1000)

    while (Date.now() < deadline) {
      const job = await requestJson<JobResponse<Result>>(
        `${this.#baseURL}/api/v1/jobs/${encodeURIComponent(id)}`,
        {
          fetch: this.#fetch,
          headers: this.#headers(),
          providerId: "filerouter",
          ...(options.signal && { signal: options.signal }),
        }
      )

      if (job.status === "complete") {
        return job.result
      }
      if (job.status === "failed") {
        throw new FileRouterError(job.error, { code: "ParseFailed" })
      }
      await abortableSleep(this.#pollingIntervalMs, options.signal)
    }

    throw new FileRouterError("FileRouter job timed out.", { code: "Timeout" })
  }

  #headers(): Headers {
    return new Headers({ Authorization: `Bearer ${this.#apiKey}` })
  }
}
