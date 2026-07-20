export type HttpErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 410
  | 413
  | 429
  | 500

interface HttpErrorOptions {
  code?: string
  headers?: HeadersInit
}

export class HttpError extends Error {
  readonly code?: string
  readonly headers?: HeadersInit
  readonly status: HttpErrorStatus

  constructor(
    status: HttpErrorStatus,
    message: string,
    options: HttpErrorOptions = {}
  ) {
    super(message)
    this.code = options.code
    this.headers = options.headers
    this.name = "HttpError"
    this.status = status
  }
}
