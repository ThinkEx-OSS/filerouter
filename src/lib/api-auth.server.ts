import { withAuth } from "@/lib/auth.server"
import { HttpError } from "@/lib/http.server"

export interface ApiPrincipal {
  credentialId: string
  kind: "api-key"
  userId: string
}

const API_KEY_RATE_LIMITED = "RATE_LIMITED"
const API_KEY_USAGE_EXCEEDED = "USAGE_EXCEEDED"

export async function requireApiPrincipal(
  request: Request,
  permission: "create" | "read"
): Promise<ApiPrincipal> {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) {
    throw unauthorizedApiKey("Missing FileRouter API key.")
  }

  const token = authorization.slice("Bearer ".length).trim()
  if (!token) {
    throw unauthorizedApiKey("Invalid FileRouter API key.")
  }

  const result = await withAuth((auth) =>
    auth.api.verifyApiKey({
      body: {
        key: token,
        permissions: { jobs: [permission] },
      },
    })
  )

  if (!result.valid || !result.key) {
    const limitError = getApiKeyLimitError(result.error)
    if (limitError) {
      throw limitError
    }
    throw unauthorizedApiKey("Invalid FileRouter API key.")
  }

  return {
    credentialId: result.key.id,
    kind: "api-key",
    userId: result.key.referenceId,
  }
}

function unauthorizedApiKey(message: string): HttpError {
  return new HttpError(401, message, {
    headers: { "WWW-Authenticate": 'Bearer realm="FileRouter"' },
  })
}

function getApiKeyLimitError(error: unknown): HttpError | undefined {
  if (!isRecord(error) || typeof error.code !== "string") {
    return undefined
  }

  if (error.code === API_KEY_USAGE_EXCEEDED) {
    return new HttpError(429, "FileRouter API key usage limit exceeded.", {
      code: "api_key_usage_exceeded",
    })
  }
  if (error.code !== API_KEY_RATE_LIMITED) {
    return undefined
  }

  const tryAgainIn = isRecord(error.details)
    ? error.details.tryAgainIn
    : undefined
  const retryAfterSeconds =
    typeof tryAgainIn === "number" && Number.isFinite(tryAgainIn)
      ? Math.max(1, Math.ceil(tryAgainIn / 1000))
      : undefined

  return new HttpError(429, "FileRouter API key rate limit exceeded.", {
    code: "api_key_rate_limited",
    ...(retryAfterSeconds && {
      headers: { "Retry-After": String(retryAfterSeconds) },
    }),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
