import { FileRouterError } from "../errors"
import { requestJson } from "./http"
import { abortableSleep } from "./sleep"

const MAX_TRANSIENT_ATTEMPTS = 3
const INITIAL_RETRY_DELAY_MS = 250
const MAX_RETRY_DELAY_MS = 10_000

export interface HostedTransportOptions {
  apiKey: string
  baseURL: string
  fetch?: typeof globalThis.fetch
}

export class HostedTransport {
  readonly #apiKey: string
  readonly #baseURL: string
  readonly #fetch: typeof globalThis.fetch | undefined

  constructor(options: HostedTransportOptions) {
    this.#apiKey = options.apiKey
    this.#baseURL = options.baseURL
    this.#fetch = options.fetch
  }

  request<Result>(
    path: string,
    init: RequestInit = {},
    options: { retry?: boolean } = {}
  ): Promise<Result> {
    const operation = () =>
      requestJson<Result>(`${this.#baseURL}${path}`, {
        ...init,
        headers: this.headers(init.headers),
        providerId: "filerouter",
        ...(this.#fetch && { fetch: this.#fetch }),
      })
    return options.retry === false
      ? operation()
      : retryTransient(operation, init.signal)
  }

  private headers(init?: HeadersInit): Headers {
    const headers = new Headers(init)
    headers.set("Authorization", `Bearer ${this.#apiKey}`)
    return headers
  }
}

async function retryTransient<Result>(
  operation: () => Promise<Result>,
  signal?: AbortSignal | null
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
      await abortableSleep(retryDelay(error, attempt), signal ?? undefined)
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
