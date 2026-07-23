import { describe, expect, test, vi } from "vite-plus/test"

import { FileRouter } from "../src/client"
import { MAX_HOSTED_JOB_REQUEST_BYTES } from "../src/hosted"

describe("FileRouter", () => {
  test("stores a document, runs one provider, and retrieves its result", async () => {
    const result = parseResult("llamaparse", "# Hosted result")
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(document("document-1")))
      .mockResolvedValueOnce(Response.json({ id: "job-1", status: "queued" }))
      .mockResolvedValueOnce(
        Response.json(job("job-1", "document-1", [execution("execution-1")]))
      )
      .mockResolvedValueOnce(Response.json(result))
    const client = createClient(fetchMock)

    await expect(
      client.parse("https://example.com/report.pdf")
    ).resolves.toEqual(result)
    expect(fetchMock.mock.calls.map(([url]) => requestUrl(url))).toEqual([
      "https://example.com/api/v1/documents",
      "https://example.com/api/v1/jobs",
      "https://example.com/api/v1/jobs/job-1",
      "https://example.com/api/v1/executions/execution-1/result",
    ])
    expect(readJsonBody(fetchMock, 0)).toEqual({
      url: "https://example.com/report.pdf",
    })
    expect(readJsonBody(fetchMock, 1)).toEqual({
      documentId: "document-1",
      outputs: ["markdown"],
      providers: [{ provider: "llamaparse" }],
    })
  })

  test("streams a readable upload without buffering it into a Blob", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("document"))
        controller.close()
      },
    })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(document("document-2")))
      .mockResolvedValueOnce(Response.json({ id: "job-2", status: "queued" }))
      .mockResolvedValueOnce(
        Response.json(job("job-2", "document-2", [execution("execution-2")]))
      )
      .mockResolvedValueOnce(Response.json(parseResult("llamaparse", "text")))

    await createClient(fetchMock).parse(stream)

    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(stream)
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get("content-type")).toBe("application/octet-stream")
    expect(headers.get("x-filerouter-content-type")).toBe(
      "application/octet-stream"
    )
    expect(headers.get("x-filerouter-filename")).toBe("document")
  })

  test("maps provider options onto explicit execution targets", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(document("document-3")))
      .mockResolvedValueOnce(Response.json({ id: "job-3", status: "queued" }))
      .mockResolvedValueOnce(
        Response.json(job("job-3", "document-3", [execution("execution-3")]))
      )
      .mockResolvedValueOnce(Response.json(parseResult("llamaparse", "text")))

    await createClient(fetchMock).parse(new Blob(["document"]), {
      idempotencyKey: "parse-report-3",
      pages: [1, 3],
      providerOptions: { llamaparse: { tier: "agentic" } },
    })

    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("idempotency-key")
    ).toBe("parse-report-3:document")
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("idempotency-key")
    ).toBe("parse-report-3")
    expect(readJsonBody(fetchMock, 1)).toMatchObject({
      providers: [
        {
          options: { tier: "agentic" },
          pages: [1, 3],
          provider: "llamaparse",
        },
      ],
    })
  })

  test("assembles comparisons from per-execution results", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(document("document-4")))
      .mockResolvedValueOnce(Response.json({ id: "job-4", status: "queued" }))
      .mockResolvedValueOnce(
        Response.json(
          job("job-4", "document-4", [
            execution("execution-4a", "llamaparse"),
            execution("execution-4b", "liteparse"),
          ])
        )
      )
      .mockResolvedValueOnce(Response.json(parseResult("llamaparse", "a")))
      .mockResolvedValueOnce(Response.json(parseResult("liteparse", "b")))

    const comparison = await createClient(fetchMock).compare(
      "https://example.com/report.pdf",
      { providers: ["llamaparse", "liteparse"] }
    )

    expect(comparison.providers).toMatchObject([
      { provider: "llamaparse", status: "parsed" },
      { provider: "liteparse", status: "parsed" },
    ])
  })

  test("applies the timeout before starting work", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    await expect(
      createClient(fetchMock).parse("https://example.com/report.pdf", {
        timeoutMs: 0,
      })
    ).rejects.toMatchObject({ code: "Timeout" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("rejects non-object provider options before job submission", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(document("document-5")))
    const client = createClient(fetchMock)

    await expect(
      client.parse("https://example.com/report.pdf", {
        providerOptions: { llamaparse: "invalid" as never },
      })
    ).rejects.toMatchObject({ code: "InvalidInput" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("rejects oversized jobs before storing the document", async () => {
    const fetchMock = vi.fn<typeof fetch>()

    await expect(
      createClient(fetchMock).parse("https://example.com/report.pdf", {
        metadata: { note: "x".repeat(MAX_HOSTED_JOB_REQUEST_BYTES) },
      })
    ).rejects.toMatchObject({ code: "InvalidInput" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("deletes a stored document", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(
      createClient(fetchMock).documents.delete("document-6")
    ).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/v1/documents/document-6",
      expect.objectContaining({ method: "DELETE" })
    )
  })
})

function createClient(fetchMock: typeof fetch): FileRouter {
  return new FileRouter({
    apiKey: "fr_test_key",
    baseURL: "https://example.com",
    fetch: fetchMock,
    pollingIntervalMs: 0,
  })
}

function document(id: string) {
  return {
    contentType: "application/pdf",
    createdAt: "2026-07-18T00:00:00.000Z",
    etag: "etag",
    expiresAt: "2026-07-25T00:00:00.000Z",
    id,
    name: "report.pdf",
    size: 10,
    status: "ready",
  }
}

function execution(
  id: string,
  provider: "liteparse" | "llamaparse" = "llamaparse"
) {
  return {
    createdAt: "2026-07-18T00:00:00.000Z",
    durationMs: 10,
    id,
    jobId: "job",
    outputs: ["markdown"],
    provider,
    resultAvailable: true,
    status: "complete",
  }
}

function job(id: string, documentId: string, executions: Array<object>) {
  return {
    createdAt: "2026-07-18T00:00:00.000Z",
    documentId,
    executions,
    id,
    status: "complete",
    updatedAt: "2026-07-18T00:00:01.000Z",
  }
}

function parseResult(provider: string, markdown: string) {
  return {
    id: `result-${provider}`,
    outputs: { markdown },
    pageCount: 1,
    provider,
    timing: {
      completedAt: "2026-07-18T00:00:01.000Z",
      durationMs: 1000,
      startedAt: "2026-07-18T00:00:00.000Z",
    },
    warnings: [],
  }
}

function readJsonBody(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  const body = fetchMock.mock.calls[index]?.[1]?.body
  if (typeof body !== "string") {
    throw new Error("Expected a JSON request body.")
  }
  return JSON.parse(body) as unknown
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input
  }
  return input instanceof URL ? input.href : input.url
}
