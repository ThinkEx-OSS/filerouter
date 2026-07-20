import { describe, expect, test, vi } from "vite-plus/test"

import { FileRouter } from "../src/index"
import { llamaparse } from "../src/llamaparse"

describe("llamaparse", () => {
  test("exposes submission separately from retryable result polling", async () => {
    const create = vi.fn().mockResolvedValue({ id: "parse-job" })
    const get = vi.fn().mockResolvedValue({
      job: { id: "parse-job", status: "COMPLETED" },
      markdown: { pages: [{ markdown: "# Parsed", page_number: 1 }] },
    })
    const provider = llamaparse({ client: { parsing: { create, get } } })

    const job = await provider.jobs?.submit(
      {
        kind: "url",
        url: "https://example.com/sample.pdf",
      },
      {
        outputs: ["markdown"],
      }
    )

    expect(job?.id).toBe("parse-job")
    expect(create).toHaveBeenCalledTimes(1)
    if (!job) {
      throw new Error("Expected a LlamaParse job reference.")
    }

    const status = await provider.jobs?.get(job, {
      outputs: ["markdown"],
      timeoutMs: 1000,
    })
    expect(status?.status).toBe("complete")
    if (status?.status !== "complete") {
      throw new Error("Expected a completed LlamaParse job.")
    }
    expect(status.result.outputs.markdown).toBe("# Parsed")
    expect(status.result.raw).toBeUndefined()
    expect(get).toHaveBeenCalledWith(
      "parse-job",
      expect.objectContaining({ expand: ["markdown"] }),
      undefined
    )
  })

  test("normalizes markdown, text, metadata, tables, and images", async () => {
    const create = vi.fn().mockResolvedValue({ id: "parse-job" })
    const get = vi.fn().mockResolvedValue({
      images_content_metadata: {
        images: [
          {
            content_type: "image/png",
            filename: "chart.png",
            presigned_url: "https://example.com/chart.png",
          },
        ],
      },
      items: {
        pages: [
          {
            items: [
              {
                md: "| A | B |",
                rows: [["A", "B"]],
                type: "table",
              },
            ],
            page_number: 1,
            success: true,
          },
        ],
      },
      job: { id: "parse-job", status: "COMPLETED" },
      job_metadata: { credits: 1 },
      markdown: {
        pages: [{ markdown: "# Page 1", page_number: 1, success: true }],
      },
      metadata: { pages: [{ confidence: 0.9, page_number: 1 }] },
      text: { pages: [{ page_number: 1, text: "Page 1" }] },
    })
    const router = new FileRouter({
      providers: {
        llamaparse: llamaparse({ client: { parsing: { create, get } } }),
      },
    })

    const result = await router.parse("https://example.com/sample.pdf", {
      outputs: ["markdown", "text", "pages", "tables", "images", "metadata"],
      provider: "llamaparse",
      pages: [1, 3],
      providerOptions: {
        llamaparse: {
          agentic_options: { custom_prompt: "Preserve footnotes" },
          tier: "agentic",
        },
        "mistral-ocr": { includeBlocks: true },
      },
    })

    expect(result.id).toBe("parse-job")
    expect(result.outputs.markdown).toBe("# Page 1")
    expect(result.outputs.pages?.[0]?.metadata).toMatchObject({
      confidence: 0.9,
    })
    expect(result.outputs.tables).toHaveLength(1)
    expect(result.outputs.images).toHaveLength(1)
    expect(result.usage?.credits).toBe(1)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentic_options: { custom_prompt: "Preserve footnotes" },
        page_ranges: { target_pages: "1,3" },
        tier: "agentic",
      }),
      undefined
    )
    expect(get).toHaveBeenCalledWith(
      "parse-job",
      expect.objectContaining({
        expand: expect.arrayContaining(["images_content_metadata"]),
      }),
      undefined
    )
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("includeBlocks")
  })
})
