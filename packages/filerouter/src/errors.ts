export type FileRouterErrorCode =
  | "ProviderNotFound"
  | "ProviderUnsupportedOutput"
  | "ProviderUnavailable"
  | "InvalidInput"
  | "Auth"
  | "RateLimit"
  | "Timeout"
  | "ParseFailed"
  | "Unknown"

export interface FileRouterErrorOptions {
  cause?: unknown
  code: FileRouterErrorCode
  providerId?: string
}

export class FileRouterError extends Error {
  readonly code: FileRouterErrorCode
  readonly providerId: string | undefined

  constructor(message: string, opts: FileRouterErrorOptions) {
    super(message)
    this.name = "FileRouterError"
    this.code = opts.code
    this.providerId = opts.providerId
    this.cause = opts.cause
  }
}

export const toFileRouterError = (
  error: unknown,
  fallback: Omit<FileRouterErrorOptions, "cause">
): FileRouterError => {
  if (error instanceof FileRouterError) {
    return error
  }

  const message =
    error instanceof Error ? error.message : "Unknown provider error"
  return new FileRouterError(message, { ...fallback, cause: error })
}
