import { describe, expect, test, vi } from "vite-plus/test"

import { datalab } from "../src/datalab"
import { FileRouter } from "../src/index"

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
          cost_breakdown: { conversion: 7 },
          markdown: "# Done",
          output_format: "markdown,json",
          page_count: 2,
          parse_quality_score: 4.5,
          status: "complete",
          total_cost: 7,
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
            output_format: "json",
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
    const router = new FileRouter({
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

  test("rejects untrusted polling URLs", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        request_check_url: "https://attacker.example/jobs/request-1",
        request_id: "request-1",
        success: true,
      })
    )
    const router = new FileRouter({
      providers: {
        datalab: datalab({ apiKey: "test-key", fetch: fetchMock }),
      },
    })

    await expect(
      router.parse("https://example.com/report.pdf")
    ).rejects.toMatchObject({ code: "ParseFailed" })
  })
})
