import { describe, expect, expectTypeOf, test, vi } from "vite-plus/test"

import { FileRouterClient } from "../src/client"
import type { HostedJobResponse } from "../src/hosted"
import type { CompareResult, ParseResult } from "../src/types"

describe("FileRouterClient jobs", () => {
  test("creates a recoverable parse job without polling", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "job-1", status: "queued" }))
    const client = createClient(fetchMock)

    const job = await client.jobs.create("https://example.com/report.pdf", {
      idempotencyKey: "stable-job-key",
      provider: "llamaparse",
    })

    expect(job).toEqual({
      id: "job-1",
      idempotencyKey: "stable-job-key",
      operation: "parse",
      status: "queued",
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(readJsonBody(fetchMock, 0)).toEqual({
      operation: "parse",
      outputs: ["markdown"],
      provider: "llamaparse",
      source: { url: "https://example.com/report.pdf" },
    })
  })

  test("creates typed comparison jobs", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "job-2", status: "queued" }))
    const client = createClient(fetchMock)

    const job = await client.jobs.create("https://example.com/report.pdf", {
      operation: "compare",
      providers: ["llamaparse", "mistral-ocr"],
    })

    expect(job.operation).toBe("compare")
    expectTypeOf(() => client.jobs.wait(job)).returns.toEqualTypeOf<
      Promise<CompareResult>
    >()
    expect(readJsonBody(fetchMock, 0)).toMatchObject({
      operation: "compare",
      providers: ["llamaparse", "mistral-ocr"],
    })
  })

  test("reads a job without waiting", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "job-3", status: "running" }))
    const client = createClient(fetchMock)

    await expect(client.jobs.get("job-3")).resolves.toEqual({
      id: "job-3",
      status: "running",
    })
    expect(requestUrl(fetchMock, 0)).toBe(
      "https://example.com/api/v1/jobs/job-3"
    )
  })

  test("waits on an existing job and reports status changes once", async () => {
    const result = parseResult("job-4")
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "job-4", status: "queued" }))
      .mockResolvedValueOnce(Response.json({ id: "job-4", status: "queued" }))
      .mockResolvedValueOnce(Response.json({ id: "job-4", status: "running" }))
      .mockResolvedValueOnce(
        Response.json({ id: "job-4", result, status: "complete" })
      )
    const client = createClient(fetchMock)
    const statuses: Array<HostedJobResponse<ParseResult>["status"]> = []

    await expect(
      client.jobs.wait<ParseResult>("job-4", {
        onStatus: (job) => statuses.push(job.status),
      })
    ).resolves.toEqual(result)
    expect(statuses).toEqual(["queued", "running", "complete"])
  })

  test("retries ambiguous creation failures with one idempotency key", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(Response.json({ id: "job-5", status: "queued" }))
    const client = createClient(fetchMock)

    const job = await client.jobs.create("https://example.com/report.pdf")

    expect(job.id).toBe("job-5")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstKey = requestHeaders(fetchMock, 0).get("idempotency-key")
    expect(firstKey).toBeTruthy()
    expect(requestHeaders(fetchMock, 1).get("idempotency-key")).toBe(firstKey)
    expect(job.idempotencyKey).toBe(firstKey)
  })

  test("retries transient polling failures", async () => {
    const result = parseResult("job-6")
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("temporary network failure"))
      .mockResolvedValueOnce(
        Response.json({ id: "job-6", result, status: "complete" })
      )
    const client = createClient(fetchMock)

    await expect(client.jobs.wait<ParseResult>("job-6")).resolves.toEqual(
      result
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("surfaces terminal job failures", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        error: "The provider rejected the document.",
        id: "job-7",
        status: "failed",
      })
    )
    const client = createClient(fetchMock)

    await expect(client.jobs.wait("job-7")).rejects.toMatchObject({
      code: "ParseFailed",
      message: "The provider rejected the document.",
      providerId: "filerouter",
    })
  })

  test("applies wait timeouts before polling", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const client = createClient(fetchMock)

    await expect(
      client.jobs.wait("job-8", { timeoutMs: 0 })
    ).rejects.toMatchObject({ code: "Timeout" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("enforces wait timeouts when custom fetch ignores abort signals", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      () => new Promise<Response>(() => undefined)
    )
    const client = createClient(fetchMock)

    await expect(
      client.jobs.wait("job-9", { timeoutMs: 10 })
    ).rejects.toMatchObject({ code: "Timeout" })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  test("validates pages before resolving file input", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const client = createClient(fetchMock)

    await expect(
      client.jobs.create(
        { kind: "file", path: "/file-that-must-not-be-read.pdf" },
        { pages: [0] }
      )
    ).rejects.toMatchObject({
      message: "Pages must be positive, one-based integers.",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function createClient(fetchMock: typeof fetch): FileRouterClient {
  return new FileRouterClient({
    apiKey: "fr_test_key",
    baseURL: "https://example.com",
    fetch: fetchMock,
    pollingIntervalMs: 0,
  })
}

function parseResult(id: string): ParseResult {
  return {
    id,
    outputs: { markdown: "# Parsed" },
    pageCount: 1,
    provider: "llamaparse",
    timing: {
      completedAt: "2026-07-21T00:00:01.000Z",
      durationMs: 1000,
      startedAt: "2026-07-21T00:00:00.000Z",
    },
    warnings: [],
  }
}

function readJsonBody(
  fetchMock: ReturnType<typeof vi.fn>,
  call: number
): unknown {
  const body = fetchMock.mock.calls[call]?.[1]?.body
  if (typeof body !== "string") {
    throw new TypeError("Expected a JSON request body.")
  }
  return JSON.parse(body)
}

function requestHeaders(
  fetchMock: ReturnType<typeof vi.fn>,
  call: number
): Headers {
  return new Headers(fetchMock.mock.calls[call]?.[1]?.headers)
}

function requestUrl(fetchMock: ReturnType<typeof vi.fn>, call: number): string {
  const input = fetchMock.mock.calls[call]?.[0]
  if (typeof input === "string") {
    return input
  }
  return input instanceof URL ? input.href : input.url
}
