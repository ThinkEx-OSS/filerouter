import { SELF } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, test, vi } from "vite-plus/test"
import { MAX_HOSTED_JOB_REQUEST_BYTES } from "@file_router/sdk/hosted"

import { api } from "@/api/app"
import { requireApiPrincipal } from "@/lib/api-auth.server"
import { withAuth } from "@/lib/auth.server"
import { createProviderSourceUrl } from "@/lib/document-source.server"
import { isHonoApiPath } from "@/lib/request-routing"

describe("FileRouter Worker", () => {
  test("publishes the document execution contract", async () => {
    const response = await SELF.fetch(
      "https://filerouter.test/api/openapi.json"
    )
    const specification = await response.json<{
      openapi: string
      paths: Record<string, unknown>
    }>()

    expect(response.status).toBe(200)
    expect(specification.openapi).toBe("3.1.0")
    expect(specification.paths).toHaveProperty("/api/v1/documents")
    expect(specification.paths).toHaveProperty("/api/v1/jobs")
    expect(specification.paths).toHaveProperty(
      "/api/v1/executions/{executionId}/result"
    )
    expect(specification.paths).toHaveProperty("/api/v1/providers")
  })

  test("reports healthy only when D1 is reachable", async () => {
    const response = await SELF.fetch("https://filerouter.test/api/v1/health")

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.json()).resolves.toEqual({ status: "ok" })
  })

  test("returns stable problem details", async () => {
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

  test("protects hosted resources", async () => {
    const response = await SELF.fetch(
      "https://filerouter.test/api/v1/documents",
      { method: "POST" }
    )

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="FileRouter"'
    )
  })

  test("stores a document and starts provider executions", async () => {
    const userId = "user-document-job"
    const apiKey = await createApiKey(userId)
    const create = vi.fn().mockResolvedValue({ id: "workflow-test" })
    const terminate = vi.fn().mockResolvedValue(undefined)
    const get = vi.fn().mockResolvedValue({
      status: vi.fn().mockResolvedValue({ status: "running" }),
      terminate,
    })
    const testEnv = envWithWorkflow(create, get)
    const documentResponse = await api.fetch(
      new Request("https://filerouter.test/api/v1/documents", {
        body: "%PDF-test",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/octet-stream",
          "Idempotency-Key": "document-test-1",
          "X-FileRouter-Filename": "report.pdf",
          "X-FileRouter-Content-Type": "application/pdf",
        },
        method: "POST",
      }),
      testEnv
    )
    expect(documentResponse.status).toBe(201)
    const document = await documentResponse.json<{ id: string }>()

    const jobResponse = await api.fetch(
      new Request("https://filerouter.test/api/v1/jobs", {
        body: JSON.stringify({
          documentId: document.id,
          outputs: ["markdown"],
          providers: [
            { provider: "llamaparse" },
            { provider: "liteparse", options: { ocr: "auto" } },
          ],
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "job-test-1",
        },
        method: "POST",
      }),
      testEnv
    )
    expect(jobResponse.status).toBe(202)
    const accepted = await jobResponse.json<{ id: string }>()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: accepted.id,
        params: expect.objectContaining({
          document: expect.objectContaining({ id: document.id }),
          targets: expect.arrayContaining([
            expect.objectContaining({ provider: "llamaparse" }),
            expect.objectContaining({ provider: "liteparse" }),
          ]),
        }),
      })
    )

    const job = await api.fetch(
      new Request(`https://filerouter.test/api/v1/jobs/${accepted.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      testEnv
    )
    await expect(job.json()).resolves.toMatchObject({
      documentId: document.id,
      executions: [
        { provider: "llamaparse", status: "queued" },
        { provider: "liteparse", status: "queued" },
      ],
      id: accepted.id,
      status: "queued",
    })

    const deleted = await api.fetch(
      new Request(`https://filerouter.test/api/v1/documents/${document.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        method: "DELETE",
      }),
      testEnv
    )
    expect(deleted.status).toBe(204)
    expect(get).toHaveBeenCalledWith(accepted.id)
    expect(terminate).toHaveBeenCalledOnce()
    expect(
      (
        await api.fetch(
          new Request(
            `https://filerouter.test/api/v1/documents/${document.id}`,
            { headers: { Authorization: `Bearer ${apiKey}` } }
          ),
          testEnv
        )
      ).status
    ).toBe(404)
    expect(
      await env.FILEROUTER_FILES.head(`documents/${document.id}/source`)
    ).toBeNull()

    await cleanupUser(userId)
  })

  test("replays document and job idempotency keys", async () => {
    const userId = "user-idempotency"
    const apiKey = await createApiKey(userId)
    const create = vi.fn().mockResolvedValue({ id: "workflow-replay" })
    const put = vi.fn((...args: Parameters<R2Bucket["put"]>) =>
      env.FILEROUTER_FILES.put(...args)
    )
    const testEnv = envWithWorkflow(create, undefined, {
      ...env.FILEROUTER_FILES,
      delete: env.FILEROUTER_FILES.delete.bind(env.FILEROUTER_FILES),
      put,
    } as R2Bucket)
    const upload = (body = "same document") =>
      api.fetch(
        new Request("https://filerouter.test/api/v1/documents", {
          body,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/octet-stream",
            "Idempotency-Key": "document-replay-1",
          },
          method: "POST",
        }),
        testEnv
      )
    const firstDocument = await upload()
    const replayedDocument = await upload()
    expect(firstDocument.status).toBe(201)
    expect(replayedDocument.status).toBe(200)
    expect(replayedDocument.headers.get("idempotent-replayed")).toBe("true")
    const conflictingDocument = await upload("diff document")
    expect(conflictingDocument.status).toBe(409)
    await expect(conflictingDocument.json()).resolves.toMatchObject({
      code: "idempotency_conflict",
    })
    expect(put).toHaveBeenCalledTimes(3)
    const objectKeys = put.mock.calls.map(([key]) => key)
    expect(new Set(objectKeys).size).toBe(3)
    await expect(
      env.FILEROUTER_FILES.head(objectKeys[0]!)
    ).resolves.not.toBeNull()
    await expect(env.FILEROUTER_FILES.head(objectKeys[1]!)).resolves.toBeNull()
    await expect(env.FILEROUTER_FILES.head(objectKeys[2]!)).resolves.toBeNull()
    const stored = await firstDocument.json<{ id: string }>()

    const createJob = () =>
      api.fetch(
        new Request("https://filerouter.test/api/v1/jobs", {
          body: JSON.stringify({
            documentId: stored.id,
            outputs: ["markdown"],
            providers: [{ provider: "llamaparse" }],
          }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": "job-replay-1",
          },
          method: "POST",
        }),
        testEnv
      )
    expect((await createJob()).status).toBe(202)
    await env.FILEROUTER_FILES.delete(objectKeys[0]!)
    await env.DB.prepare(
      "UPDATE document SET object_key = NULL, status = 'expired' WHERE id = ?"
    )
      .bind(stored.id)
      .run()
    const replayedJob = await createJob()
    expect(replayedJob.status).toBe(200)
    expect(replayedJob.headers.get("idempotent-replayed")).toBe("true")
    expect(create).toHaveBeenCalledOnce()

    await cleanupUser(userId)
  })

  test("rejects oversized job requests at the HTTP boundary", async () => {
    const userId = "user-job-size"
    const apiKey = await createApiKey(userId)
    const response = await api.fetch(
      new Request("https://filerouter.test/api/v1/jobs", {
        body: JSON.stringify({
          padding: "x".repeat(MAX_HOSTED_JOB_REQUEST_BYTES),
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "job-size-limit-1",
        },
        method: "POST",
      }),
      env
    )

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({
      code: "job_request_too_large",
    })
    await cleanupUser(userId)
  })

  test("rejects oversized JSON document requests at the HTTP boundary", async () => {
    const userId = "user-document-size"
    const apiKey = await createApiKey(userId)
    const response = await api.fetch(
      new Request("https://filerouter.test/api/v1/documents", {
        body: JSON.stringify({
          url: `https://example.com/${"x".repeat(MAX_HOSTED_JOB_REQUEST_BYTES)}`,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "document-size-limit-1",
        },
        method: "POST",
      }),
      env
    )

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({
      code: "document_request_too_large",
    })
    await cleanupUser(userId)
  })

  test("streams scoped provider source URLs", async () => {
    const documentId = "550e8400-e29b-41d4-a716-446655440000"
    const key = `documents/${documentId}/source`
    await env.FILEROUTER_FILES.put(key, "document", {
      customMetadata: { fileName: "report.pdf" },
      httpMetadata: { contentType: "application/pdf" },
    })

    try {
      const url = new URL(
        await createProviderSourceUrl(env, documentId, "report.pdf")
      )
      url.protocol = "https:"
      url.host = "filerouter.test"
      const response = await SELF.fetch(url)
      expect(response.status).toBe(200)
      expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(
        "document"
      )

      url.searchParams.set("token", "invalid")
      expect((await SELF.fetch(url)).status).toBe(404)
    } finally {
      await env.FILEROUTER_FILES.delete(key)
    }
  })

  test("verifies and disables API keys", async () => {
    const userId = "user-api-key"
    const created = await createApiKeyRecord(userId)
    const request = new Request("https://filerouter.test/api/v1/jobs", {
      headers: { Authorization: `Bearer ${created.key}` },
    })

    await expect(requireApiPrincipal(request, "read")).resolves.toMatchObject({
      credentialId: created.id,
      userId,
    })
    await env.DB.prepare("UPDATE apikey SET enabled = 0 WHERE id = ?")
      .bind(created.id)
      .run()
    await expect(requireApiPrincipal(request, "read")).rejects.toMatchObject({
      status: 401,
    })
    await cleanupUser(userId)
  })

  test("validates the CLI client and reserves auth routes", async () => {
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
    expect(valid.status).toBe(200)
    expect(isHonoApiPath("/api/auth/device/code")).toBe(false)
    expect(isHonoApiPath("/api/v1/documents")).toBe(true)
  })
})

async function insertUser(id: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)"
  )
    .bind(id, id, `${id}@example.com`, Date.now(), Date.now())
    .run()
}

async function createApiKey(id: string): Promise<string> {
  return (await createApiKeyRecord(id)).key
}

async function createApiKeyRecord(id: string) {
  await insertUser(id)
  return withAuth((auth) =>
    auth.api.createApiKey({ body: { name: "Worker test", userId: id } })
  )
}

async function cleanupUser(id: string): Promise<void> {
  const documents = await env.DB.prepare(
    "SELECT object_key FROM document WHERE user_id = ? AND object_key IS NOT NULL"
  )
    .bind(id)
    .all<{ object_key: string }>()
  const keys = documents.results.map((stored) => stored.object_key)
  if (keys.length > 0) {
    await env.FILEROUTER_FILES.delete(keys)
  }
  await env.DB.prepare("DELETE FROM user WHERE id = ?").bind(id).run()
}

function authRequest(path: string, init?: RequestInit): Promise<Response> {
  return withAuth((auth) =>
    auth.handler(new Request(`https://filerouter.test/api/auth${path}`, init))
  )
}

function envWithWorkflow(
  create: ReturnType<typeof vi.fn>,
  get: ReturnType<typeof vi.fn> = vi.fn(),
  files: R2Bucket = env.FILEROUTER_FILES
): Cloudflare.Env {
  return {
    ...env,
    DOCUMENT_WORKFLOW: {
      create,
      createBatch: vi.fn(),
      get,
    } as Cloudflare.Env["DOCUMENT_WORKFLOW"],
    FILEROUTER_FILES: files,
  }
}
