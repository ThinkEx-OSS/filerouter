export {
  JOB_ID_HEADER,
  RELEASE_ID_HEADER,
  REQUEST_ID_HEADER,
  serializeError,
} from "../engines/shared/observability"

export function emitWideEvent(
  env: Cloudflare.Env,
  level: "error" | "info",
  event: Record<string, unknown> & { event: string; service: string }
): void {
  console[level]({
    timestamp: new Date().toISOString(),
    environment: "production",
    release_id: env.WORKER_VERSION.id,
    release_tag: env.WORKER_VERSION.tag,
    release_uploaded_at: env.WORKER_VERSION.timestamp,
    ...event,
  })
}

export function responseWithRequestId(
  response: Response,
  requestId: string
): Response {
  const headers = new Headers(response.headers)
  headers.set("X-Request-Id", requestId)
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
