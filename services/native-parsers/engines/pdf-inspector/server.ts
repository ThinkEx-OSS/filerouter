import { classifyPdf, extractPagesMarkdown } from "@firecrawl/pdf-inspector"

import runtimePackage from "./package.json" with { type: "json" }

import type { NativeParserResult } from "../shared/contracts.ts"
import { ParserRequestError, startParserServer } from "../shared/http.ts"
import { readNativeParserOptions, readObject } from "../shared/options.ts"

const ENGINE_VERSION = runtimePackage.dependencies["@firecrawl/pdf-inspector"]
const MAX_INPUT_BYTES = 50 * 1024 * 1024
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024
const MAX_PAGES = 1_000

startParserServer({
  handler: async ({ bytes, options }) => parsePdf(bytes, options),
  maxBytes: MAX_INPUT_BYTES,
  maxConcurrency: 4,
  maxResponseBytes: MAX_OUTPUT_BYTES,
  parserId: "pdf-inspector",
})

function parsePdf(bytes: Buffer, value: unknown): NativeParserResult {
  const options = readNativeParserOptions(value)
  const requestedPages = options.pages
  if (
    options.providerOptions !== undefined &&
    Object.keys(readObject(options.providerOptions)).length > 0
  ) {
    throw new ParserRequestError(
      400,
      "invalid_provider_options",
      "PDF Inspector does not accept provider options."
    )
  }
  const classification = classifyPdf(bytes)
  if (classification.pageCount > MAX_PAGES && !requestedPages) {
    throw new ParserRequestError(
      413,
      "provider_limit_exceeded",
      `PDF Inspector supports at most ${MAX_PAGES} pages per request.`
    )
  }
  if (requestedPages?.some((page) => page > classification.pageCount)) {
    throw new ParserRequestError(
      400,
      "invalid_pages",
      "Requested page exceeds the document page count."
    )
  }
  const selectedPages = requestedPages?.map((page) => page - 1)
  const extraction = extractPagesMarkdown(bytes, selectedPages)
  const pages = extraction.pages.map((page) => ({
    markdown: page.markdown,
    metadata: {
      ...(page.needsOcr && { needsOcr: true }),
      ...(page.ocrReason && { ocrReason: page.ocrReason }),
    },
    pageNumber: page.page + 1,
  }))
  const warnings = extraction.pages.flatMap((page) =>
    page.needsOcr
      ? [
          {
            code: "ocr_required",
            message: page.ocrReason
              ? `Page requires OCR: ${page.ocrReason}.`
              : "Page requires OCR.",
            pageNumber: page.page + 1,
          },
        ]
      : []
  )

  return {
    engine: { id: "pdf-inspector", version: ENGINE_VERSION },
    markdown: pages.map((page) => page.markdown ?? "").join("\n\n"),
    metadata: {
      confidence: classification.confidence,
      isComplex: extraction.isComplex,
      pagesNeedingOcr: extraction.pagesNeedingOcr,
      pagesWithColumns: extraction.pagesWithColumns,
      pagesWithTables: extraction.pagesWithTables,
      pdfType: classification.pdfType,
    },
    pageCount: classification.pageCount,
    pages,
    warnings,
  }
}
