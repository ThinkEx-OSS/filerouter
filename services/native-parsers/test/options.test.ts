import { describe, expect, test } from "vite-plus/test"

import {
  assertPdfInspectorPageLimit,
  MAX_PDF_INSPECTOR_PAGES,
} from "../engines/pdf-inspector/options.ts"

describe("native parser limits", () => {
  test("caps selected PDF Inspector pages", () => {
    expect(() =>
      assertPdfInspectorPageLimit(MAX_PDF_INSPECTOR_PAGES)
    ).not.toThrow()
    expect(() =>
      assertPdfInspectorPageLimit(MAX_PDF_INSPECTOR_PAGES + 1)
    ).toThrow("PDF Inspector supports at most 1000 pages per request.")
  })
})
