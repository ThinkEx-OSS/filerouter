import { describe, expect, test, vi } from "vite-plus/test"
import { SELF } from "cloudflare:test"
import { env } from "cloudflare:workers"

import { api } from "@/api/app"
import {
  createDocumentJob,
  failDocumentJob,
  getDocumentJobResponse,
} from "@/lib/document-jobs.server"
import { requireApiPrincipal } from "@/lib/api-auth.server"
import { withAuth } from "@/lib/auth.server"
import { createProviderSourceUrl } from "@/lib/document-source.server"
import { isHonoApiPath } from "@/lib/request-routing"

describe("FileRouter Worker", () => {
  test("serves the OpenAPI contract through the Worker entrypoint", async () => {
    const response = await SELF.fetch(
      "https://filerouter.test/api/openapi.json"
    )
    const document = await response.json<{
      openapi: string
      paths: Record<string, unknown>
    }>()

    expect(response.status).toBe(200)
    expect(document.openapi).toBe("3.1.0")
    expect(document.paths).toHaveProperty("/api/v1/jobs")
  })

  test("reports healthy only when D1 is reachable", async () => {
    const response = await SELF.fetch("https://filerouter.test/api/v1/health")

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.json()).resolves.toEqual({ status: "ok" })
  })

  test("returns stable problem details from the Worker runtime", async () => {
    const response = await SELF.fetch("https://filerouter.test/api/v1/missing")
    const problem = await response.json<{
      code: string
      request_id: string
    }>()

    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json"
    )
    expect(problem.code).toBe("route_not_found")
    expect(problem.request_id).toBe(response.headers.get("x-request-id"))
  })

  test("protects hosted jobs", async () => {
    const createJob = await SELF.fetch("https://filerouter.test/api/v1/jobs", {
      method: "POST",
    })

    expect(createJob.status).toBe(401)
    expect(createJob.headers.get("www-authenticate")).toBe(
      'Bearer realm="FileRouter"'
    )
    await expect(createJob.json<{ detail: string }>()).resolves.toMatchObject({
      detail: "Missing FileRouter API key.",
    })
  })

  test("accepts binary uploads through the OpenAPI route", async () => {
    await insertUser("user-binary-upload")
    const apiKey = await withAuth((auth) =>
      auth.api.createApiKey({
        body: { name: "Binary upload test", userId: "user-binary-upload" },
      })
    )
    const createBatch = vi.fn().mockResolvedValue([{ id: "workflow-upload" }])
    const testEnv = envWithWorkflow(createBatch)
    const response = await api.fetch(
      new Request("https://filerouter.test/api/v1/jobs", {
        body: '{"document":true}',
        headers: {
          Authorization: `Bearer ${apiKey.key}`,
          "Content-Type": "application/octet-stream",
          "Idempotency-Key": "binary-upload-1",
          "X-FileRouter-Content-Type": "application/json",
          "X-FileRouter-Filename": "document.json",
        },
        method: "POST",
      }),
      testEnv
    )
    expect(response.status).toBe(202)
    const job = await response.json<{ id: string }>()
    const sourceKey = `jobs/${job.id}/source`

    try {
      expect(createBatch).toHaveBeenCalledOnce()
      const source = await env.FILEROUTER_FILES.head(sourceKey)
      expect(source?.httpMetadata?.contentType).toBe("application/json")
    } finally {
      await env.FILEROUTER_FILES.delete(sourceKey)
      await env.DB.prepare("DELETE FROM document_job WHERE id = ?")
        .bind(job.id)
        .run()
    }
  })

  test("streams scoped provider source URLs without an API key", async () => {
    const sourceJobId = "550e8400-e29b-41d4-a716-446655440000"
    const sourceKey = `jobs/${sourceJobId}/source`
    await env.FILEROUTER_FILES.put(sourceKey, "document", {
      customMetadata: { fileName: "report.pdf" },
      httpMetadata: { contentType: "application/pdf" },
    })

    try {
      const url = new URL(
        await createProviderSourceUrl(env, sourceJobId, "report.pdf")
      )
      url.protocol = "https:"
      url.host = "filerouter.test"
      const response = await SELF.fetch(url)

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("application/pdf")
      expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(
        "document"
      )

      const rangeResponse = await SELF.fetch(url, {
        headers: { Range: "bytes=1-3" },
      })
      expect(rangeResponse.status).toBe(206)
      expect(rangeResponse.headers.get("content-range")).toBe("bytes 1-3/8")
      expect(new TextDecoder().decode(await rangeResponse.arrayBuffer())).toBe(
        "ocu"
      )

      const invalidRange = await SELF.fetch(url, {
        headers: { Range: "bytes=20-30" },
      })
      expect(invalidRange.status).toBe(416)
      expect(invalidRange.headers.get("content-range")).toBe("bytes */8")

      url.searchParams.set("token", "invalid")
      expect((await SELF.fetch(url)).status).toBe(404)
    } finally {
      await env.FILEROUTER_FILES.delete(sourceKey)
    }
  })

  test("verifies Better Auth API keys and rejects disabled or expired keys", async () => {
    await insertUser("user-api-key")
    const created = await withAuth((auth) =>
      auth.api.createApiKey({
        body: { name: "Worker test", userId: "user-api-key" },
      })
    )
    const request = new Request("https://filerouter.test/api/v1/jobs", {
      headers: { Authorization: `Bearer ${created.key}` },
    })

    await expect(requireApiPrincipal(request, "read")).resolves.toMatchObject({
      credentialId: created.id,
      kind: "api-key",
      userId: "user-api-key",
    })

    await env.DB.prepare("UPDATE apikey SET enabled = 0 WHERE id = ?")
      .bind(created.id)
      .run()
    await expect(requireApiPrincipal(request, "read")).rejects.toMatchObject({
      status: 401,
    })

    await env.DB.prepare(
      "UPDATE apikey SET enabled = 1, expires_at = ? WHERE id = ?"
    )
      .bind(Math.floor(Date.now() / 1_000) - 1, created.id)
      .run()
    await expect(requireApiPrincipal(request, "read")).rejects.toMatchObject({
      status: 401,
    })
  })

  test("returns API-key rate limits as retryable responses", async () => {
    await insertUser("user-rate-limit")
    const created = await withAuth((auth) =>
      auth.api.createApiKey({
        body: { name: "Rate limit test", userId: "user-rate-limit" },
      })
    )
    await env.DB.prepare(
      "UPDATE apikey SET request_count = 300, last_request = ? WHERE id = ?"
    )
      .bind(Math.floor(Date.now() / 1_000), created.id)
      .run()

    const response = await SELF.fetch(
      "https://filerouter.test/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000",
      { headers: { Authorization: `Bearer ${created.key}` } }
    )

    expect(response.status).toBe(429)
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0)
    await expect(response.json<{ code: string }>()).resolves.toMatchObject({
      code: "api_key_rate_limited",
    })
  })

  test("validates the registered CLI device client", async () => {
    const invalid = await authRequest("/device/code", {
      body: JSON.stringify({ client_id: "unknown-client" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(invalid.status).toBe(400)

    const valid = await authRequest("/device/code", {
      body: JSON.stringify({ client_id: "filerouter-cli" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const authorization = await valid.json<{ verification_uri: string }>()
    expect(valid.status).toBe(200)
    expect(authorization.verification_uri).toBe(
      "https://filerouter.test/device"
    )
  })

  test("reserves Better Auth routes for the TanStack handler", () => {
    expect(isHonoApiPath("/api/auth/device/code")).toBe(false)
    expect(isHonoApiPath("/api/v1/jobs")).toBe(true)
    expect(isHonoApiPath("/api/openapi.json")).toBe(true)
  })

  test("replays idempotent jobs without starting another Workflow", async () => {
    await insertUser("user-idempotent")
    const createBatch = vi.fn().mockResolvedValue([{ id: "workflow-1" }])
    const testEnv = envWithWorkflow(createBatch)

    const first = await createDocumentJob(
      urlJobRequest("https://example.com/report.pdf"),
      "user-idempotent",
      testEnv,
      "retry-report-1",
      "request-idempotent-1"
    )
    const replay = await createDocumentJob(
      urlJobRequest("https://example.com/report.pdf"),
      "user-idempotent",
      testEnv,
      "retry-report-1",
      "request-idempotent-2"
    )

    expect(first).toMatchObject({
      job: { status: "queued" },
      replayed: false,
    })
    expect(replay).toEqual({ ...first, replayed: true })
    expect(createBatch).toHaveBeenCalledTimes(1)

    await expect(
      createDocumentJob(
        urlJobRequest("https://example.com/different.pdf"),
        "user-idempotent",
        testEnv,
        "retry-report-1",
        "request-idempotent-3"
      )
    ).rejects.toMatchObject({ code: "idempotency_conflict", status: 409 })
  })

  test("returns completed job results without an extra envelope", async () => {
    await insertUser("user-complete-result")
    const created = await createDocumentJob(
      urlJobRequest("https://example.com/report.pdf"),
      "user-complete-result",
      envWithWorkflow(vi.fn().mockResolvedValue([{ id: "workflow-result" }])),
      "complete-result-1",
      "request-complete-result"
    )
    const resultKey = `jobs/${created.job.id}/result.json`
    const result = {
      outputs: { markdown: "Report" },
      pageCount: 1,
      provider: "llamaparse",
    }

    await env.FILEROUTER_FILES.put(resultKey, JSON.stringify(result))
    await env.DB.prepare(
      "UPDATE document_job SET status = 'complete', result_key = ? WHERE id = ?"
    )
      .bind(resultKey, created.job.id)
      .run()

    const response = await getDocumentJobResponse(
      created.job.id,
      "user-complete-result",
      env,
      "request-complete-result"
    )
    expect(response).toBeInstanceOf(Response)
    if (!(response instanceof Response)) {
      throw new Error("Expected a streaming job response.")
    }
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    await expect(response.json()).resolves.toEqual({
      id: created.job.id,
      result,
      status: "complete",
    })
    await env.FILEROUTER_FILES.delete(resultKey)
  })

  test("does not serve expired job results", async () => {
    await insertUser("user-expired-result")
    const created = await createDocumentJob(
      urlJobRequest("https://example.com/expired.pdf"),
      "user-expired-result",
      envWithWorkflow(vi.fn().mockResolvedValue([{ id: "workflow-expired" }])),
      "expired-result-1",
      "request-expired-result"
    )
    const resultKey = `jobs/${created.job.id}/result.json`
    await env.FILEROUTER_FILES.put(resultKey, '{"outputs":{}}')
    await env.DB.prepare(
      "UPDATE document_job SET status = 'complete', result_key = ?, result_expires_at = ? WHERE id = ?"
    )
      .bind(resultKey, Math.floor(Date.now() / 1_000) - 1, created.job.id)
      .run()

    await expect(
      getDocumentJobResponse(
        created.job.id,
        "user-expired-result",
        env,
        "request-expired-result"
      )
    ).rejects.toMatchObject({ code: "result_expired", status: 410 })
    expect(await env.FILEROUTER_FILES.head(resultKey)).toBeNull()
  })

  test("cleans up D1 and R2 when Workflow startup fails", async () => {
    await insertUser("user-cleanup")
    const testEnv = envWithWorkflow(
      vi.fn().mockRejectedValue(new Error("workflow unavailable")),
      vi.fn().mockRejectedValue(new Error("workflow not found"))
    )
    const request = uploadJobRequest()

    await expect(
      createDocumentJob(
        request,
        "user-cleanup",
        testEnv,
        "cleanup-report-1",
        "request-cleanup"
      )
    ).rejects.toThrow("workflow unavailable")

    const jobs = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM document_job WHERE user_id = ?"
    )
      .bind("user-cleanup")
      .first<{ count: number }>()
    const objects = await env.FILEROUTER_FILES.list({ prefix: "jobs/" })

    expect(jobs?.count).toBe(0)
    expect(objects.objects).toHaveLength(0)
  })

  test("preserves a job when Workflow startup succeeded ambiguously", async () => {
    await insertUser("user-workflow-reconcile")
    const createBatch = vi
      .fn()
      .mockRejectedValue(new Error("workflow response was lost"))
    const getWorkflow = vi.fn().mockResolvedValue({ id: "workflow-reconciled" })
    const testEnv = envWithWorkflow(createBatch, getWorkflow)
    const request = uploadJobRequest()

    const created = await createDocumentJob(
      request,
      "user-workflow-reconcile",
      testEnv,
      "reconcile-report-1",
      "request-reconcile"
    )
    const sourceKey = `jobs/${created.job.id}/source`

    try {
      expect(created.job.status).toBe("queued")
      expect(createBatch).toHaveBeenCalledOnce()
      expect(createBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          id: created.job.id,
          params: expect.objectContaining({ jobId: created.job.id }),
        }),
      ])
      expect(getWorkflow).toHaveBeenCalledWith(created.job.id)
      expect(await env.FILEROUTER_FILES.head(sourceKey)).not.toBeNull()
    } finally {
      await env.FILEROUTER_FILES.delete(sourceKey)
      await env.DB.prepare("DELETE FROM document_job WHERE id = ?")
        .bind(created.job.id)
        .run()
    }
  })

  test.each(["queued", "running"] as const)(
    "can mark a %s job failed after a workflow error",
    async (status) => {
      const userId = `user-failed-${status}`
      await insertUser(userId)
      const created = await createDocumentJob(
        urlJobRequest("https://example.com/report.pdf"),
        userId,
        envWithWorkflow(
          vi.fn().mockResolvedValue([{ id: `workflow-${status}` }])
        ),
        `failed-${status}-1`,
        `request-failed-${status}`
      )

      try {
        if (status === "running") {
          await env.DB.prepare(
            "UPDATE document_job SET status = 'running' WHERE id = ?"
          )
            .bind(created.job.id)
            .run()
        }
        await failDocumentJob(env.DB, {
          clearSource: true,
          error: "Workflow failed before execution started.",
          jobId: created.job.id,
        })

        const job = await env.DB.prepare(
          "SELECT error, source_key, status FROM document_job WHERE id = ?"
        )
          .bind(created.job.id)
          .first<{
            error: string | null
            source_key: string | null
            status: string
          }>()
        expect(job).toEqual({
          error: "Workflow failed before execution started.",
          source_key: null,
          status: "failed",
        })
      } finally {
        await env.DB.prepare("DELETE FROM document_job WHERE id = ?")
          .bind(created.job.id)
          .run()
      }
    }
  )
})

function urlJobRequest(url: string): Request {
  return new Request("https://filerouter.test/api/v1/jobs", {
    body: JSON.stringify({
      operation: "parse",
      outputs: ["markdown"],
      source: { url },
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

function uploadJobRequest(): Request {
  return new Request("https://filerouter.test/api/v1/jobs", {
    body: new Blob(["document"], { type: "application/pdf" }),
    headers: {
      "Content-Type": "application/pdf",
      "X-FileRouter-Filename": "report.pdf",
    },
    method: "POST",
  })
}

async function insertUser(id: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)"
  )
    .bind(id, id, `${id}@example.com`, Date.now(), Date.now())
    .run()
}

function authRequest(path: string, init?: RequestInit): Promise<Response> {
  return withAuth((auth) =>
    auth.handler(new Request(`https://filerouter.test/api/auth${path}`, init))
  )
}

function envWithWorkflow(
  createBatch: ReturnType<typeof vi.fn>,
  get: ReturnType<typeof vi.fn> = vi.fn()
): Cloudflare.Env {
  return {
    ...env,
    DOCUMENT_WORKFLOW: { createBatch, get },
  } as unknown as Cloudflare.Env
}
