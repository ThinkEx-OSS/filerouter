import { describe, expect, test, vi } from "vite-plus/test"

import { datalab } from "../src/datalab"
import { DirectFileRouter } from "../src/index"

describe("Datalab provider", () => {
  test("exposes submission separately from retryable result polling", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          request_check_url: "https://www.datalab.to/api/v1/convert/request-1",
          request_id: "request-1",
          success: true,
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          images: { "figure.png": "base64-image" },
          checkpoint_id: "checkpoint-1",
          cost_breakdown: { conversion: 7, total: 7 },
          markdown: "# Done",
          output_format: "markdown,json",
          page_count: 2,
          parse_quality_score: 4.5,
          status: "complete",
        })
      )
    const provider = datalab({
      apiKey: "test-key",
      fetch: fetchMock,
      pollingIntervalMs: 0,
    })

    const job = await provider.jobs?.submit(
      {
        kind: "url",
        url: "https://example.com/report.pdf",
      },
      {
        outputs: ["markdown", "images", "metadata"],
        pages: [1, 3],
        providerOptions: {
          datalab: {
            add_block_ids: true,
            mode: "accurate",
          },
          llamaparse: { tier: "fast" },
        },
      }
    )

    expect(job?.id).toBe("request-1")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    if (!job) {
      throw new Error("Expected a Datalab job reference.")
    }
    const status = await provider.jobs?.get(job, {
      outputs: ["markdown", "images", "metadata"],
    })
    if (status?.status !== "complete") {
      throw new Error("Expected a completed Datalab job.")
    }
    const result = status.result
    expect(result.outputs.markdown).toBe("# Done")
    expect(result.raw).toBeUndefined()
    expect(result.outputs.images).toEqual([
      expect.objectContaining({
        data: "base64-image",
        mimeType: "image/png",
        name: "figure.png",
      }),
    ])
    expect(result.outputs.metadata).toMatchObject({
      checkpointId: "checkpoint-1",
      costBreakdown: { conversion: 7 },
      outputFormat: "markdown,json",
    })
    expect(result.quality).toEqual({ score: 4.5, scale: 5 })
    expect(result.usage).toMatchObject({ costUsd: 0.07, pages: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body
    expect(requestBody).toBeInstanceOf(FormData)
    if (!(requestBody instanceof FormData)) {
      throw new Error("Expected Datalab form data.")
    }
    expect(requestBody.get("mode")).toBe("accurate")
    expect(requestBody.get("page_range")).toBe("0,2")
    expect(requestBody.get("add_block_ids")).toBe("true")
    expect(requestBody.get("output_format")).toBe("markdown,json")
    expect(requestBody.get("tier")).toBeNull()
  })

  test("submits, polls, and normalizes a conversion", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          request_check_url: "https://www.datalab.to/api/v1/convert/request-1",
          request_id: "request-1",
          success: true,
        })
      )
      .mockResolvedValueOnce(Response.json({ status: "processing" }))
      .mockResolvedValueOnce(
        Response.json({
          markdown: "# Converted document",
          page_count: 1,
          status: "complete",
          success: true,
        })
      )
    const router = new DirectFileRouter({
      providers: {
        datalab: datalab({
          apiKey: "test-key",
          fetch: fetchMock,
          pollingIntervalMs: 0,
        }),
      },
    })

    const result = await router.parse("https://example.com/report.pdf")

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const body = fetchMock.mock.calls[0]?.[1]?.body
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get("mode")).toBeNull()
    expect(result).toMatchObject({
      id: "request-1",
      outputs: { markdown: "# Converted document" },
      pageCount: 1,
      provider: "datalab",
      usage: { pages: 1 },
    })
  })

  test("normalizes page-level JSON into portable pages", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          request_check_url: "https://www.datalab.to/api/v1/convert/request-1",
          request_id: "request-1",
          success: true,
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          json: {
            children: [
              {
                bbox: [0, 0, 100, 100],
                block_type: "Page",
                children: [
                  {
                    block_type: "SectionHeader",
                    children: [
                      {
                        block_type: "Text",
                        html: "First",
                        id: "/page/0/Text/2",
                        markdown: "First",
                      },
                    ],
                    html: "<h1><content-ref src='/page/0/Text/2'></content-ref></h1>",
                    id: "/page/0/SectionHeader/1",
                    markdown:
                      "# <content-ref src='/page/0/Text/2'></content-ref>",
                  },
                ],
                html: "<content-ref src='/page/0/SectionHeader/1'></content-ref>",
                id: "/page/0/Page/0",
                markdown:
                  "<content-ref src='/page/0/SectionHeader/1'></content-ref>",
              },
              {
                block_type: "Page",
                children: [
                  {
                    html: "<p>Third</p>",
                    markdown: "Third",
                  },
                ],
                html: "<p>Third</p>",
                id: "/page/2/Page/2",
                markdown: "Third",
              },
            ],
          },
          page_count: 2,
          status: "complete",
          success: true,
        })
      )
    const router = new DirectFileRouter({
      providers: {
        datalab: datalab({
          apiKey: "test-key",
          fetch: fetchMock,
          pollingIntervalMs: 0,
        }),
      },
    })

    const result = await router.parse("https://example.com/report.pdf", {
      outputs: ["pages"],
      pageFields: ["html", "json", "markdown", "metadata"],
      pages: [1, 3],
    })

    expect(result.outputs.pages).toEqual([
      {
        html: "<h1>First</h1>",
        json: expect.objectContaining({ id: "/page/0/Page/0" }),
        markdown: "# First",
        metadata: {
          bbox: [0, 0, 100, 100],
          blockId: "/page/0/Page/0",
        },
        pageNumber: 1,
        warnings: [],
      },
      {
        html: "<p>Third</p>",
        json: expect.objectContaining({ id: "/page/2/Page/2" }),
        markdown: "Third",
        metadata: { blockId: "/page/2/Page/2" },
        pageNumber: 3,
        warnings: [],
      },
    ])
    const body = fetchMock.mock.calls[0]?.[1]?.body
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get("output_format")).toBe("json")
    expect((body as FormData).get("include_markdown_in_chunks")).toBe("true")
    expect((body as FormData).get("page_range")).toBe("0,2")
  })

  test("preserves an explicit markdown-in-JSON opt-out", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          request_check_url: "https://www.datalab.to/api/v1/convert/request-2",
          request_id: "request-2",
          success: true,
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          json: {
            children: [
              {
                bbox: [0, 0, 100, 100],
                block_type: "Page",
                html: "<p>First</p>",
                id: "/page/0/Page/0",
                markdown: "First",
              },
            ],
          },
          page_count: 1,
          status: "complete",
          success: true,
        })
      )
    const router = new DirectFileRouter({
      providers: {
        datalab: datalab({
          apiKey: "test-key",
          fetch: fetchMock,
          pollingIntervalMs: 0,
        }),
      },
    })

    const result = await router.parse("https://example.com/report.pdf", {
      outputs: ["pages"],
      pageFields: ["markdown"],
      providerOptions: {
        datalab: { include_markdown_in_chunks: false },
      },
    })

    const body = fetchMock.mock.calls[0]?.[1]?.body
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get("include_markdown_in_chunks")).toBe("false")
    expect(result.outputs.pages).toEqual([
      {
        markdown: "First",
        pageNumber: 1,
        warnings: [],
      },
    ])
  })

  test("rejects untrusted polling URLs", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        request_check_url: "https://attacker.example/jobs/request-1",
        request_id: "request-1",
        success: true,
      })
    )
    const router = new DirectFileRouter({
      providers: {
        datalab: datalab({ apiKey: "test-key", fetch: fetchMock }),
      },
    })

    await expect(
      router.parse("https://example.com/report.pdf")
    ).rejects.toMatchObject({ code: "ParseFailed" })
  })
})
