import { describe, expect, test, vi } from "vite-plus/test"

import { FileRouterClient } from "../src/client"

describe("FileRouterClient", () => {
  test("creates and waits for hosted parse jobs", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "job-1", status: "queued" }))
      .mockResolvedValueOnce(Response.json({ id: "job-1", status: "running" }))
      .mockResolvedValueOnce(
        Response.json({
          id: "job-1",
          result: {
            id: "provider-job-1",
            outputs: { markdown: "# Hosted result" },
            pageCount: 1,
            provider: "llamaparse",
            timing: {
              completedAt: "2026-07-18T00:00:01.000Z",
              durationMs: 1000,
              startedAt: "2026-07-18T00:00:00.000Z",
            },
            warnings: [],
          },
          status: "complete",
        })
      )
    const client = new FileRouterClient({
      apiKey: "fr_test_key",
      baseURL: "https://example.com",
      fetch: fetchMock,
      pollingIntervalMs: 0,
    })

    const result = await client.parse("https://example.com/report.pdf")

    expect(result.outputs.markdown).toBe("# Hosted result")
    expect(fetchMock.mock.calls.map(([url]) => requestUrl(url))).toEqual([
      "https://example.com/api/v1/jobs",
      "https://example.com/api/v1/jobs/job-1",
      "https://example.com/api/v1/jobs/job-1",
    ])
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body
    if (typeof requestBody !== "string") {
      throw new Error("Expected a JSON request body")
    }
    expect(JSON.parse(requestBody)).toEqual({
      operation: "parse",
      outputs: ["markdown"],
      source: { url: "https://example.com/report.pdf" },
    })
  })

  test("streams binary inputs directly in the request body", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "job-2", status: "queued" }))
      .mockResolvedValueOnce(
        Response.json({
          id: "job-2",
          result: {
            id: "provider-job-2",
            outputs: {},
            pageCount: 0,
            provider: "llamaparse",
            timing: {
              completedAt: "2026-07-18T00:00:00.000Z",
              durationMs: 0,
              startedAt: "2026-07-18T00:00:00.000Z",
            },
            warnings: [],
          },
          status: "complete",
        })
      )
    const client = new FileRouterClient({
      apiKey: "fr_test_key",
      baseURL: "https://example.com",
      fetch: fetchMock,
    })

    await client.parse(
      {
        data: new Blob(["document"], { type: "application/pdf" }),
        kind: "bytes",
        name: "report.pdf",
      },
      {
        pages: [1, 3],
        providerOptions: { llamaparse: { tier: "agentic" } },
      }
    )

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get("content-type")).toBe("application/pdf")
    expect(headers.get("idempotency-key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/
    )
    expect(headers.get("x-filerouter-filename")).toBe("report.pdf")
    expect(headers.get("x-filerouter-pages")).toBe("1,3")
    expect(
      JSON.parse(
        decodeURIComponent(headers.get("x-filerouter-provider-options") ?? "")
      )
    ).toEqual({ llamaparse: { tier: "agentic" } })
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeInstanceOf(Blob)
  })

  test("reuses a caller-provided idempotency key", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          id: "job-3",
          status: "running",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "job-3",
          result: {
            id: "provider-job-3",
            outputs: {},
            pageCount: 0,
            provider: "llamaparse",
            timing: {
              completedAt: "2026-07-18T00:00:00.000Z",
              durationMs: 0,
              startedAt: "2026-07-18T00:00:00.000Z",
            },
            warnings: [],
          },
          status: "complete",
        })
      )
    const client = new FileRouterClient({
      apiKey: "fr_test_key",
      baseURL: "https://example.com",
      fetch: fetchMock,
      pollingIntervalMs: 0,
    })

    await client.parse("https://example.com/report.pdf", {
      idempotencyKey: "retry-job-3",
    })

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get("idempotency-key")).toBe("retry-job-3")
  })
})

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input
  }
  return input instanceof URL ? input.href : input.url
}
