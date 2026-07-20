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

export class HttpError extends Error {
  readonly code?: string
  readonly status: HttpErrorStatus

  constructor(status: HttpErrorStatus, message: string, code?: string) {
    super(message)
    this.code = code
    this.name = "HttpError"
    this.status = status
  }
}
