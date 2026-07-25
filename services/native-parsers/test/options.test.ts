import { describe, expect, test } from "vite-plus/test"

import {
  assertPdfInspectorPageLimit,
  MAX_PDF_INSPECTOR_PAGES,
} from "../engines/pdf-inspector/options.ts"
import { selectNativeParserResult } from "../engines/shared/selection.ts"

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

describe("native parser output selection", () => {
  test("drops unrequested top-level and page data", () => {
    expect(
      selectNativeParserResult(
        {
          engine: { id: "liteparse", version: "test" },
          markdown: "# Document",
          metadata: { ocrEnabled: false },
          pageCount: 1,
          pages: [
            {
              dimensions: { height: 100, width: 100 },
              markdown: "# Page",
              metadata: { textItems: ["large"] },
              pageNumber: 1,
              text: "Page",
            },
          ],
          text: "Document",
          warnings: [],
        },
        { outputs: ["pages"], pageFields: ["markdown"] }
      )
    ).toEqual({
      engine: { id: "liteparse", version: "test" },
      metadata: { ocrEnabled: false },
      pageCount: 1,
      pages: [{ markdown: "# Page", pageNumber: 1 }],
      warnings: [],
    })
  })
})
