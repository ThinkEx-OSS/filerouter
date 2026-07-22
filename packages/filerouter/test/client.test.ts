import { describe, expect, test, vi } from "vite-plus/test"

import { FileRouterClient } from "../src/client"
import { FileRouterError } from "../src/errors"
import { MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES } from "../src/hosted"

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
    expect(headers.get("content-type")).toBe("application/octet-stream")
    expect(headers.get("x-filerouter-content-type")).toBe("application/pdf")
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

  test("applies the timeout before creating a hosted job", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const client = new FileRouterClient({
      apiKey: "fr_test_key",
      baseURL: "https://example.com",
      fetch: fetchMock,
    })

    await expect(
      client.parse("https://example.com/report.pdf", { timeoutMs: 0 })
    ).rejects.toMatchObject({ code: "Timeout" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("rejects timeouts beyond the platform timer limit", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const client = new FileRouterClient({
      apiKey: "fr_test_key",
      baseURL: "https://example.com",
      fetch: fetchMock,
    })

    await expect(
      client.parse("https://example.com/report.pdf", {
        timeoutMs: 2_147_483_648,
      })
    ).rejects.toMatchObject({ code: "InvalidInput" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("exposes retry details from hosted API errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { detail: "Try again later." },
          { headers: { "Retry-After": "3" }, status: 429 }
        )
      )
    const client = new FileRouterClient({
      apiKey: "fr_test_key",
      baseURL: "https://example.com",
      fetch: fetchMock,
    })

    const request = client.jobs.get("job-rate-limited")

    await expect(request).rejects.toMatchObject({
      code: "RateLimit",
      providerId: "filerouter",
      retryable: true,
      retryAfterMs: 3000,
      statusCode: 429,
    })
    await request.catch((error: unknown) => {
      expect(FileRouterError.isInstance(error)).toBe(true)
    })
  })

  test("identifies an empty hosted credit balance", async () => {
    const client = new FileRouterClient({
      apiKey: "fr_test_key",
      baseURL: "https://example.com",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ detail: "You're out of credits." }, { status: 402 })
        ),
    })

    await expect(client.jobs.get("job-payment-required")).rejects.toMatchObject(
      {
        code: "PaymentRequired",
        providerId: "filerouter",
        retryable: false,
        statusCode: 402,
      }
    )
  })

  test("normalizes hosted network failures", async () => {
    const client = new FileRouterClient({
      apiKey: "fr_test_key",
      baseURL: "https://example.com",
      fetch: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError("fetch failed")),
    })

    await expect(
      client.parse("https://example.com/report.pdf")
    ).rejects.toMatchObject({
      code: "ProviderUnavailable",
      providerId: "filerouter",
      retryable: true,
    })
  })

  test("rejects provider options that cannot be sent as JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const client = new FileRouterClient({
      apiKey: "fr_test_key",
      baseURL: "https://example.com",
      fetch: fetchMock,
    })
    const circular: Record<string, unknown> = {}
    circular.self = circular

    await expect(
      client.parse("https://example.com/report.pdf", {
        providerOptions: { custom: circular },
      })
    ).rejects.toMatchObject({ code: "InvalidInput" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("bounds provider options carried in upload headers", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const client = new FileRouterClient({
      apiKey: "fr_test_key",
      baseURL: "https://example.com",
      fetch: fetchMock,
    })

    await expect(
      client.parse(new Blob(["document"], { type: "application/pdf" }), {
        providerOptions: {
          custom: {
            value: "x".repeat(MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES),
          },
        },
      })
    ).rejects.toMatchObject({ code: "InvalidInput" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input
  }
  return input instanceof URL ? input.href : input.url
}
