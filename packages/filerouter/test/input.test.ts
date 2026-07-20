import { describe, expect, test } from "vite-plus/test"

import {
  normalizeDocumentFileName,
  resolveDocumentMimeType,
} from "../src/index"
import { resolveParseInput } from "../src/internal/input"

describe("document input", () => {
  test("uses explicit, inferred, then generic MIME types", () => {
    expect(
      resolveDocumentMimeType("report.pdf", "text/plain; charset=utf-8")
    ).toBe("text/plain")
    expect(
      resolveDocumentMimeType("report.pdf", "application/octet-stream")
    ).toBe("application/pdf")
    expect(resolveDocumentMimeType("report.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    expect(resolveDocumentMimeType("unknown.bin", "not a MIME type")).toBe(
      "application/octet-stream"
    )
  })

  test("normalizes names and applies MIME overrides to Blob input", async () => {
    expect(normalizeDocumentFileName("folder\\report.pdf")).toBe("report.pdf")

    const resolved = await resolveParseInput({
      data: new Blob(["document"], { type: "text/plain" }),
      kind: "bytes",
      mimeType: "application/pdf",
      name: "report.pdf",
    })

    expect(resolved).toMatchObject({ kind: "bytes", name: "report.pdf" })
    expect(resolved.kind === "bytes" && resolved.data.type).toBe(
      "application/pdf"
    )
  })
})
