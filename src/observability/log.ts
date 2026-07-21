export const REQUEST_ID_HEADER = "x-request-id"
export const JOB_ID_HEADER = "x-filerouter-job-id"

type LogLevel = "error" | "info"

type VersionMetadata = {
  id: string
  tag: string
  timestamp: string
}

export interface ObservabilityEnv {
  ENVIRONMENT?: string
  WORKER_VERSION?: VersionMetadata
}

export type WideEvent = Record<string, unknown> & {
  event: string
  service: string
}

export function emitWideEvent(
  env: ObservabilityEnv,
  level: LogLevel,
  event: WideEvent
): void {
  const release = env.WORKER_VERSION
  const record = {
    timestamp: new Date().toISOString(),
    environment:
      env.ENVIRONMENT ?? (import.meta.env.DEV ? "development" : "production"),
    ...(release && {
      release_id: release.id,
      release_tag: release.tag,
      release_uploaded_at: release.timestamp,
    }),
    ...event,
  }

  console[level](record)
}

export function serializeError(error: unknown): {
  error_message: string
  error_type: string
} {
  return error instanceof Error
    ? { error_message: error.message, error_type: error.name }
    : { error_message: "Unknown error", error_type: "UnknownError" }
}

export function requestIdFrom(request: Request): string {
  const value = request.headers.get(REQUEST_ID_HEADER)?.trim()
  return value && value.length <= 128 ? value : crypto.randomUUID()
}

export function withRequestId(
  request: Request,
  requestId = requestIdFrom(request)
): Request {
  if (request.headers.get(REQUEST_ID_HEADER) === requestId) {
    return request
  }
  const headers = new Headers(request.headers)
  headers.set(REQUEST_ID_HEADER, requestId)
  return new Request(request, { headers })
}

export function withResponseRequestId(
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
