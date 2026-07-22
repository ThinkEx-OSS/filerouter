import type { Context, Env } from "hono"
import { FILEROUTER_DEFAULT_API_URL } from "@file_router/sdk/hosted"

import type { HttpError } from "@/lib/http.server"

const statusMetadata = {
  400: { code: "bad_request", title: "Bad Request" },
  401: { code: "unauthorized", title: "Unauthorized" },
  402: { code: "payment_required", title: "Payment Required" },
  403: { code: "forbidden", title: "Forbidden" },
  404: { code: "not_found", title: "Not Found" },
  409: { code: "conflict", title: "Conflict" },
  410: { code: "gone", title: "Gone" },
  413: { code: "payload_too_large", title: "Payload Too Large" },
  429: { code: "rate_limited", title: "Too Many Requests" },
  500: { code: "internal_error", title: "Internal Server Error" },
} as const

export function problemResponse<E extends Env>(
  context: Context<E>,
  error: HttpError
): Response {
  const metadata = statusMetadata[error.status]
  const requestId = context.get("requestId")
  const headers = new Headers(error.headers)
  headers.set("Content-Type", "application/problem+json")
  headers.set("X-Request-Id", requestId)

  return Response.json(
    {
      code: error.code ?? metadata.code,
      detail: error.message,
      instance: context.req.path,
      request_id: requestId,
      status: error.status,
      title: metadata.title,
      type: `${FILEROUTER_DEFAULT_API_URL}/problems/${error.code ?? metadata.code}`,
    },
    {
      headers,
      status: error.status,
    }
  )
}
