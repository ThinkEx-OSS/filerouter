import { ParserRequestError } from "../shared/http.ts"

export const MAX_PDF_INSPECTOR_PAGES = 1_000

export function assertPdfInspectorPageLimit(pageCount: number): void {
  if (pageCount > MAX_PDF_INSPECTOR_PAGES) {
    throw new ParserRequestError(
      413,
      "provider_limit_exceeded",
      `PDF Inspector supports at most ${MAX_PDF_INSPECTOR_PAGES} pages per request.`
    )
  }
}
