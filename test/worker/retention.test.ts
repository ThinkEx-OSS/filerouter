import { env } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { describe, expect, test } from "vite-plus/test"

import { documentJob, user } from "@/db/schema"
import { createDb } from "@/db/server"
import { runDocumentRetentionCleanup } from "@/lib/document-retention.server"

describe("document retention", () => {
  test("removes expired objects and old job records", async () => {
    const now = new Date("2026-07-19T12:00:00.000Z")
    const db = createDb(env.DB)
    const userId = crypto.randomUUID()
    await db.insert(user).values({
      email: `${userId}@example.com`,
      emailVerified: true,
      id: userId,
      name: "Retention test",
    })

    const expiredId = crypto.randomUUID()
    const oldId = crypto.randomUUID()
    const currentId = crypto.randomUUID()
    const expiredResultKey = `jobs/${expiredId}/result.json`
    const expiredSourceKey = `jobs/${expiredId}/source`
    const oldSourceKey = `jobs/${oldId}/source`
    const currentResultKey = `jobs/${currentId}/result.json`

    await Promise.all([
      env.FILEROUTER_FILES.put(expiredResultKey, "expired"),
      env.FILEROUTER_FILES.put(expiredSourceKey, "source"),
      env.FILEROUTER_FILES.put(oldSourceKey, "old source"),
      env.FILEROUTER_FILES.put(currentResultKey, "current"),
    ])

    const common = {
      fileName: "report.pdf",
      operation: "parse" as const,
      outputs: ["markdown" as const],
      providers: ["llamaparse" as const],
      requestHash: "request-hash",
      userId,
    }
    await db.insert(documentJob).values([
      {
        ...common,
        createdAt: new Date("2026-07-10T12:00:00.000Z"),
        id: expiredId,
        idempotencyKeyHash: "expired-key",
        resultExpiresAt: new Date("2026-07-19T11:59:59.000Z"),
        resultKey: expiredResultKey,
        sourceKey: expiredSourceKey,
        status: "complete",
        updatedAt: new Date("2026-07-12T12:00:00.000Z"),
      },
      {
        ...common,
        createdAt: new Date("2026-06-18T12:00:00.000Z"),
        id: oldId,
        idempotencyKeyHash: "old-key",
        sourceKey: oldSourceKey,
        status: "failed",
        updatedAt: new Date("2026-06-18T12:00:00.000Z"),
      },
      {
        ...common,
        createdAt: new Date("2026-07-18T12:00:00.000Z"),
        id: currentId,
        idempotencyKeyHash: "current-key",
        resultExpiresAt: new Date("2026-07-20T12:00:00.000Z"),
        resultKey: currentResultKey,
        status: "complete",
        updatedAt: new Date("2026-07-18T12:00:00.000Z"),
      },
    ])

    await expect(runDocumentRetentionCleanup(env, now)).resolves.toEqual({
      deletedJobs: 1,
      deletedResults: 1,
      deletedSources: 2,
    })

    expect(await env.FILEROUTER_FILES.head(expiredResultKey)).toBeNull()
    expect(await env.FILEROUTER_FILES.head(expiredSourceKey)).toBeNull()
    expect(await env.FILEROUTER_FILES.head(oldSourceKey)).toBeNull()
    expect(await env.FILEROUTER_FILES.head(currentResultKey)).not.toBeNull()

    const expiredJob = await db
      .select({ resultKey: documentJob.resultKey })
      .from(documentJob)
      .where(eq(documentJob.id, expiredId))
      .get()
    const oldJob = await db
      .select({ id: documentJob.id })
      .from(documentJob)
      .where(eq(documentJob.id, oldId))
      .get()

    expect(expiredJob?.resultKey).toBeNull()
    expect(oldJob).toBeUndefined()
  })
})
