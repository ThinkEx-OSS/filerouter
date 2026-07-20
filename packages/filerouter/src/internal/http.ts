import { FileRouterError } from "../errors"

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
  const response = await fetchImplementation(url, init)
  const payload = await readJson(response)

  if (!response.ok) {
    throw new FileRouterError(readErrorMessage(payload, response.statusText), {
      code: errorCodeForStatus(response.status),
      providerId,
    })
  }

  return payload as T
}

function errorCodeForStatus(
  status: number
): "Auth" | "ParseFailed" | "RateLimit" {
  if (status === 401 || status === 403) {
    return "Auth"
  }
  if (status === 429) {
    return "RateLimit"
  }
  return "ParseFailed"
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
