import { describe, expect, test, vi } from "vite-plus/test"

import { FileRouter } from "../src"
import { mistralOcr } from "../src/mistral"

describe("Mistral OCR provider", () => {
  test("normalizes page markdown from a URL", async () => {
    const process = vi.fn().mockResolvedValue({
      model: "mistral-ocr-latest",
      pages: [
        { index: 0, markdown: "# Page one", images: [], tables: [] },
        { index: 1, markdown: "Page two", images: [], tables: [] },
      ],
      usageInfo: { docSizeBytes: 10, pagesProcessed: 2 },
    })
    const router = new FileRouter({
      providers: {
        mistral: mistralOcr({
          client: {
            files: { delete: vi.fn(), upload: vi.fn() },
            ocr: { process },
          },
        }),
      },
    })

    const result = await router.parse("https://example.com/report.pdf", {
      outputs: ["markdown", "pages"],
    })

    expect(result.provider).toBe("mistral-ocr")
    expect(result.outputs.pages?.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(result.outputs.markdown).toContain("# Page one")
    expect(result.raw).toBeUndefined()
    expect(result.usage?.pages).toBe(2)
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({
        document: {
          documentUrl: "https://example.com/report.pdf",
          type: "document_url",
        },
      }),
      expect.any(Object)
    )
  })

  test("uploads files, forwards native options, and cleans up", async () => {
    const upload = vi.fn().mockResolvedValue({ id: "file-1" })
    const deleteFile = vi.fn().mockResolvedValue({ deleted: true })
    const process = vi.fn().mockResolvedValue({
      pages: [
        {
          blocks: [{ type: "text" }],
          confidenceScores: { page: 0.98 },
          dimensions: { height: 1000, width: 800 },
          images: [
            {
              bottomRightX: 20,
              bottomRightY: 30,
              id: "img-1",
              imageBase64: "base64-image",
              topLeftX: 1,
              topLeftY: 2,
            },
          ],
          index: 0,
          markdown: "# Page",
          tables: [
            { content: "<table></table>", format: "html", id: "table-1" },
          ],
        },
      ],
      usageInfo: { docSizeBytes: 3, pagesProcessed: 1 },
    })
    const provider = mistralOcr({
      client: {
        files: { delete: deleteFile, upload },
        ocr: { process },
      },
    })

    const result = await provider.parse(
      {
        data: new Blob(["pdf"], { type: "application/pdf" }),
        kind: "bytes",
        mimeType: "application/pdf",
        name: "report.pdf",
      },
      {
        includeRaw: true,
        outputs: ["images", "json", "tables"],
        pages: [1],
        providerOptions: {
          "mistral-ocr": {
            confidenceScoresGranularity: "page",
            includeImageBase64: true,
            tableFormat: "html",
          },
        },
      }
    )

    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({
        confidenceScoresGranularity: "page",
        document: { fileId: "file-1", type: "file" },
        includeImageBase64: true,
        pages: [0],
        tableFormat: "html",
      }),
      expect.any(Object)
    )
    expect(upload).toHaveBeenCalledTimes(1)
    expect(deleteFile).toHaveBeenCalledWith(
      { fileId: "file-1" },
      expect.any(Object)
    )
    expect(result.outputs.images).toEqual([
      expect.objectContaining({ data: "base64-image", id: "img-1" }),
    ])
    expect(result.outputs.tables).toEqual([
      expect.objectContaining({
        content: "<table></table>",
        format: "html",
        html: "<table></table>",
      }),
    ])
    expect(result.raw).toBeDefined()
  })
})
