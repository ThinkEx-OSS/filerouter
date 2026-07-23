import { describe, expect, test, vi } from "vite-plus/test"

import { FileRouter } from "../src/client"
import { MAX_HOSTED_JOB_REQUEST_BYTES } from "../src/hosted"

describe("hosted resources", () => {
  test("creates recoverable jobs from stored documents", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "job-1", status: "queued" }))
    const client = createClient(fetchMock)

    await expect(
      client.jobs.create(
        {
          documentId: "document-1",
          outputs: ["markdown"],
          providers: [{ provider: "llamaparse" }],
        },
        { idempotencyKey: "job-create-1" }
      )
    ).resolves.toEqual({ id: "job-1", status: "queued" })
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get("idempotency-key")).toBe("job-create-1")
  })

  test("waits for a terminal job and reports status transitions once", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(job("queued")))
      .mockResolvedValueOnce(Response.json(job("running")))
      .mockResolvedValueOnce(Response.json(job("running")))
      .mockResolvedValueOnce(Response.json(job("complete")))
    const statuses: Array<string> = []

    await expect(
      createClient(fetchMock).jobs.wait("job-2", {
        onStatus: (value) => statuses.push(value.status),
      })
    ).resolves.toMatchObject({ status: "complete" })
    expect(statuses).toEqual(["queued", "running", "complete"])
  })

  test("retries transient reads", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ detail: "try again" }, { status: 503 })
      )
      .mockResolvedValueOnce(Response.json(job("complete")))

    await expect(
      createClient(fetchMock).jobs.get("job-3")
    ).resolves.toMatchObject({ status: "complete" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("surfaces payment failures without retrying", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ detail: "out of credits" }, { status: 402 })
      )

    await expect(
      createClient(fetchMock).jobs.get("job-4")
    ).rejects.toMatchObject({ code: "PaymentRequired", retryable: false })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  test("rejects ambiguous or oversized jobs before sending them", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const jobs = createClient(fetchMock).jobs
    const base = {
      documentId: "document-1",
      outputs: ["markdown" as const],
    }

    await expect(
      jobs.create({
        ...base,
        providers: [{ provider: "llamaparse" }, { provider: "llamaparse" }],
      })
    ).rejects.toMatchObject({ code: "InvalidInput" })
    await expect(
      jobs.create({ ...base, outputs: [], providers: [] })
    ).rejects.toMatchObject({ code: "InvalidInput" })
    await expect(
      jobs.create({
        ...base,
        metadata: Object.fromEntries(
          Array.from({ length: 51 }, (_, index) => [`key-${index}`, "value"])
        ),
        providers: [{ provider: "llamaparse" }],
      })
    ).rejects.toMatchObject({ code: "InvalidInput" })
    await expect(
      jobs.create({
        ...base,
        providers: [
          {
            options: { prompt: "x".repeat(MAX_HOSTED_JOB_REQUEST_BYTES) },
            provider: "llamaparse",
          },
        ],
      })
    ).rejects.toMatchObject({ code: "InvalidInput" })
    expect(fetchMock).not.toHaveBeenCalled()
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

function job(status: "complete" | "queued" | "running") {
  return {
    createdAt: "2026-07-18T00:00:00.000Z",
    documentId: "document-1",
    executions: [],
    id: "job",
    status,
    updatedAt: "2026-07-18T00:00:00.000Z",
  }
}
