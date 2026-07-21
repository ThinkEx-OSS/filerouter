import { FileRouterError, toFileRouterError } from "../errors"
import type { FileRouterErrorCode } from "../errors"
import { isRecord } from "./record"

export interface JsonRequestOptions extends RequestInit {
  fetch?: typeof globalThis.fetch | undefined
  providerId: string
}

export async function requestJson<T>(
  url: string | URL,
  options: JsonRequestOptions
): Promise<T> {
  const {
    fetch: fetchImplementation = globalThis.fetch,
    providerId,
    ...init
  } = options
  let response: Response
  try {
    response = await fetchImplementation(url, init)
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }
    throw toFileRouterError(error, {
      code: "ProviderUnavailable",
      providerId,
    })
  }
  const payload = await readJson(response)

  if (!response.ok) {
    const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"))
    throw new FileRouterError(readErrorMessage(payload, response.statusText), {
      code: errorCodeForStatus(response.status),
      providerId,
      ...(retryAfterMs !== undefined && { retryAfterMs }),
      statusCode: response.status,
    })
  }

  return payload as T
}

function errorCodeForStatus(status: number): FileRouterErrorCode {
  if (status === 401 || status === 403) {
    return "Auth"
  }
  if (status === 408 || status === 504) {
    return "Timeout"
  }
  if (status === 429) {
    return "RateLimit"
  }
  if (status >= 500) {
    return "ProviderUnavailable"
  }
  return "ParseFailed"
}

function parseRetryAfter(value: string | null): number | undefined {
  const normalized = value?.trim()
  if (!normalized) {
    return undefined
  }
  if (/^\d+$/.test(normalized)) {
    const milliseconds = Number(normalized) * 1000
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined
  }

  const retryAt = Date.parse(normalized)
  return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - Date.now())
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload)) {
    for (const field of ["detail", "error", "message"]) {
      if (typeof payload[field] === "string" && payload[field].length > 0) {
        return payload[field]
      }
    }
  }
  return fallback || "Provider request failed."
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")
  if (!contentType?.includes("json")) {
    const text = await response.text()
    return text ? { message: text } : {}
  }

  return response.json()
}
