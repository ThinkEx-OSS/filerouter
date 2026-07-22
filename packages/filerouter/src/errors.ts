export type FileRouterErrorCode =
  | "ProviderNotFound"
  | "ProviderUnsupportedOutput"
  | "ProviderUnavailable"
  | "InvalidInput"
  | "Auth"
  | "PaymentRequired"
  | "RateLimit"
  | "Timeout"
  | "ParseFailed"
  | "Unknown"

const fileRouterErrorMarker = Symbol.for("file_router.error.FileRouterError")

export interface FileRouterErrorOptions {
  cause?: unknown
  code: FileRouterErrorCode
  providerId?: string
  retryable?: boolean
  retryAfterMs?: number
  statusCode?: number
}

export class FileRouterError extends Error {
  readonly code: FileRouterErrorCode
  readonly providerId: string | undefined
  readonly retryable: boolean
  readonly retryAfterMs: number | undefined
  readonly statusCode: number | undefined

  constructor(message: string, opts: FileRouterErrorOptions) {
    super(message)
    Object.defineProperty(this, fileRouterErrorMarker, { value: true })
    this.name = "FileRouterError"
    this.code = opts.code
    this.providerId = opts.providerId
    this.retryable = opts.retryable ?? isRetryableCode(opts.code)
    this.retryAfterMs = opts.retryAfterMs
    this.statusCode = opts.statusCode
    this.cause = opts.cause
  }

  static isInstance(error: unknown): error is FileRouterError {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as Record<PropertyKey, unknown>)[fileRouterErrorMarker] === true
    )
  }
}

export const toFileRouterError = (
  error: unknown,
  fallback: Omit<FileRouterErrorOptions, "cause">
): FileRouterError => {
  if (FileRouterError.isInstance(error)) {
    return error
  }

  const message =
    error instanceof Error ? error.message : "Unknown provider error"
  return new FileRouterError(message, { ...fallback, cause: error })
}

function isRetryableCode(code: FileRouterErrorCode): boolean {
  return (
    code === "ProviderUnavailable" || code === "RateLimit" || code === "Timeout"
  )
}
