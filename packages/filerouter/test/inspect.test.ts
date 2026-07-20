import { describe, expect, test } from "vite-plus/test"

import { inspectDocument } from "../src/inspect"

describe("document inspection", () => {
  test("detects binary MIME mismatches without changing the input", async () => {
    const pngBytes = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlK7p8AAAAASUVORK5CYII=",
        "base64"
      )
    )

    const inspection = await inspectDocument({
      data: pngBytes,
      kind: "bytes",
      mimeType: "application/pdf",
      name: "report.pdf",
    })

    expect(inspection).toMatchObject({
      detected: { extension: "png", mimeType: "image/png" },
      extensionMimeType: "application/pdf",
      kind: "bytes",
      mismatch: true,
      name: "report.pdf",
      resolvedMimeType: "application/pdf",
      size: pngBytes.byteLength,
    })
  })

  test("does not fetch URLs during inspection", async () => {
    await expect(
      inspectDocument("https://example.com/files/report.pdf")
    ).resolves.toMatchObject({
      extensionMimeType: "application/pdf",
      kind: "url",
      mismatch: false,
      name: "report.pdf",
      resolvedMimeType: "application/pdf",
    })
  })
})
