import { env } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { describe, expect, test } from "vite-plus/test"

import { document, documentExecution, documentJob, user } from "@/db/schema"
import { createDb } from "@/db/server"
import { getDocumentJob, getExecutionResult } from "@/lib/document-jobs.server"
import { runDocumentRetentionCleanup } from "@/lib/document-retention.server"

describe("document retention", () => {
  test("expires source documents, results, and old job records", async () => {
    const now = new Date("2026-07-19T12:00:00.000Z")
    const db = createDb(env.DB)
    const userId = crypto.randomUUID()
    await db.insert(user).values({
      email: `${userId}@example.com`,
      emailVerified: true,
      id: userId,
      name: "Retention test",
    })

    const expiredDocumentId = crypto.randomUUID()
    const oldDocumentId = crypto.randomUUID()
    const currentDocumentId = crypto.randomUUID()
    const reservedDocumentId = crypto.randomUUID()
    const expiredSourceKey = `documents/${expiredDocumentId}/source`
    const expiredResultKey = "executions/expired/result.json"
    const oldResultKey = "executions/old/result.json"
    const currentResultKey = "executions/current/result.json"
    const reservedSourceKey = `documents/${reservedDocumentId}/source`
    await Promise.all([
      env.FILEROUTER_FILES.put(expiredSourceKey, "source"),
      env.FILEROUTER_FILES.put(expiredResultKey, "expired"),
      env.FILEROUTER_FILES.put(oldResultKey, "old"),
      env.FILEROUTER_FILES.put(currentResultKey, "current"),
      env.FILEROUTER_FILES.put(reservedSourceKey, "reserved"),
    ])

    await db.insert(document).values([
      storedDocument({
        createdAt: new Date("2026-07-10T12:00:00.000Z"),
        expiresAt: new Date("2026-07-18T12:00:00.000Z"),
        id: expiredDocumentId,
        objectKey: expiredSourceKey,
        userId,
      }),
      storedDocument({
        createdAt: new Date("2026-07-10T12:00:00.000Z"),
        expiresAt: new Date("2026-07-19T11:00:00.000Z"),
        id: reservedDocumentId,
        objectKey: reservedSourceKey,
        updatedAt: new Date("2026-07-19T11:50:00.000Z"),
        userId,
      }),
      storedDocument({
        createdAt: new Date("2026-06-18T12:00:00.000Z"),
        expiresAt: new Date("2026-06-25T12:00:00.000Z"),
        id: oldDocumentId,
        objectKey: null,
        status: "expired",
        userId,
      }),
      storedDocument({
        createdAt: new Date("2026-07-18T12:00:00.000Z"),
        expiresAt: new Date("2026-07-25T12:00:00.000Z"),
        id: currentDocumentId,
        objectKey: `documents/${currentDocumentId}/source`,
        userId,
      }),
    ])

    const expiredJobId = crypto.randomUUID()
    const oldJobId = crypto.randomUUID()
    const currentJobId = crypto.randomUUID()
    await db.insert(documentJob).values([
      storedJob({
        createdAt: new Date("2026-07-10T12:00:00.000Z"),
        documentId: expiredDocumentId,
        id: expiredJobId,
        userId,
      }),
      storedJob({
        createdAt: new Date("2026-06-18T12:00:00.000Z"),
        documentId: oldDocumentId,
        id: oldJobId,
        userId,
      }),
      storedJob({
        createdAt: new Date("2026-07-18T12:00:00.000Z"),
        documentId: currentDocumentId,
        id: currentJobId,
        userId,
      }),
    ])
    await db.insert(documentExecution).values([
      storedExecution({
        id: "expired",
        jobId: expiredJobId,
        resultExpiresAt: new Date("2026-07-19T11:59:59.000Z"),
        resultKey: expiredResultKey,
      }),
      storedExecution({
        id: "old",
        jobId: oldJobId,
        resultExpiresAt: new Date("2026-07-25T12:00:00.000Z"),
        resultKey: oldResultKey,
      }),
      storedExecution({
        id: "current",
        jobId: currentJobId,
        resultExpiresAt: new Date("2026-07-25T12:00:00.000Z"),
        resultKey: currentResultKey,
      }),
    ])

    await expect(runDocumentRetentionCleanup(env, now)).resolves.toEqual({
      deletedDocuments: 1,
      deletedJobs: 1,
      deletedResults: 2,
      expiredDocuments: 1,
    })
    expect(await env.FILEROUTER_FILES.head(expiredSourceKey)).toBeNull()
    expect(await env.FILEROUTER_FILES.head(expiredResultKey)).toBeNull()
    expect(await env.FILEROUTER_FILES.head(oldResultKey)).toBeNull()
    expect(await env.FILEROUTER_FILES.head(currentResultKey)).not.toBeNull()
    expect(await env.FILEROUTER_FILES.head(reservedSourceKey)).not.toBeNull()

    await expect(
      db
        .select({ key: documentExecution.resultKey })
        .from(documentExecution)
        .where(eq(documentExecution.id, "expired"))
        .get()
    ).resolves.toEqual({ key: null })
    await expect(
      getDocumentJob(expiredJobId, userId, env)
    ).resolves.toMatchObject({
      executions: [{ id: "expired", resultAvailable: false }],
    })
    await expect(
      getExecutionResult("expired", userId, env)
    ).rejects.toMatchObject({ code: "result_expired", status: 410 })
    await expect(
      db
        .select({ id: documentJob.id })
        .from(documentJob)
        .where(eq(documentJob.id, oldJobId))
        .get()
    ).resolves.toBeUndefined()
    await expect(
      db
        .select({ id: document.id })
        .from(document)
        .where(eq(document.id, oldDocumentId))
        .get()
    ).resolves.toBeUndefined()

    await env.FILEROUTER_FILES.delete([currentResultKey, reservedSourceKey])
    await db.delete(user).where(eq(user.id, userId))
  })
})

function storedDocument(input: {
  createdAt: Date
  expiresAt: Date
  id: string
  objectKey: string | null
  status?: "expired" | "ready"
  updatedAt?: Date
  userId: string
}) {
  return {
    contentType: "application/pdf",
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    etag: `etag-${input.id}`,
    fileName: "report.pdf",
    id: input.id,
    idempotencyKeyHash: `key-${input.id}`,
    objectKey: input.objectKey,
    requestHash: `request-${input.id}`,
    size: 10,
    status: input.status ?? "ready",
    updatedAt: input.updatedAt ?? input.createdAt,
    userId: input.userId,
  }
}

function storedJob(input: {
  createdAt: Date
  documentId: string
  id: string
  userId: string
}) {
  return {
    createdAt: input.createdAt,
    documentId: input.documentId,
    id: input.id,
    idempotencyKeyHash: `key-${input.id}`,
    requestHash: `request-${input.id}`,
    status: "complete" as const,
    updatedAt: input.createdAt,
    userId: input.userId,
  }
}

function storedExecution(input: {
  id: string
  jobId: string
  resultExpiresAt: Date
  resultKey: string
}) {
  return {
    id: input.id,
    jobId: input.jobId,
    outputs: ["markdown" as const],
    position: 0,
    provider: "llamaparse" as const,
    resultExpiresAt: input.resultExpiresAt,
    resultKey: input.resultKey,
    status: "complete" as const,
  }
}
