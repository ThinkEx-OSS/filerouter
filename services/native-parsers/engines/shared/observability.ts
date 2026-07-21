export const REQUEST_ID_HEADER = "x-request-id"
export const JOB_ID_HEADER = "x-filerouter-job-id"
export const RELEASE_ID_HEADER = "x-filerouter-release-id"

export function emitWideEvent(
  level: "error" | "info",
  event: Record<string, unknown> & { event: string; service: string }
): void {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "production",
    ...event,
  })
  console[level](record)
}

export function serializeError(error: unknown) {
  return error instanceof Error
    ? { error_message: error.message, error_type: error.name }
    : { error_message: "Unknown error", error_type: "UnknownError" }
}
