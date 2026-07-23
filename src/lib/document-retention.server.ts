import { and, eq, inArray, isNotNull, lte, notExists } from "drizzle-orm"

import { document, documentExecution, documentJob } from "@/db/schema"
import { createDb } from "@/db/server"
import { jobsCreatedBefore } from "@/lib/document-retention"
import { deleteR2Objects } from "@/lib/r2-objects.server"

const CLEANUP_BATCH_SIZE = 100

export interface DocumentRetentionCleanupResult {
  deletedDocuments: number
  deletedJobs: number
  deletedResults: number
  expiredDocuments: number
}

export async function runDocumentRetentionCleanup(
  env: Cloudflare.Env,
  now = new Date()
): Promise<DocumentRetentionCleanupResult> {
  const db = createDb(env.DB)

  const expiredResults = await db
    .select({ id: documentExecution.id, key: documentExecution.resultKey })
    .from(documentExecution)
    .where(
      and(
        isNotNull(documentExecution.resultKey),
        isNotNull(documentExecution.resultExpiresAt),
        lte(documentExecution.resultExpiresAt, now)
      )
    )
    .limit(CLEANUP_BATCH_SIZE)
  await deleteR2Objects(
    env.FILEROUTER_FILES,
    expiredResults.map((execution) => execution.key)
  )
  if (expiredResults.length > 0) {
    await db
      .update(documentExecution)
      .set({ resultKey: null, updatedAt: now })
      .where(
        inArray(
          documentExecution.id,
          expiredResults.map((execution) => execution.id)
        )
      )
  }

  const expiredDocuments = await db
    .select({ id: document.id, key: document.objectKey })
    .from(document)
    .where(
      and(
        eq(document.status, "ready"),
        isNotNull(document.objectKey),
        lte(document.expiresAt, now),
        notExists(
          db
            .select({ id: documentJob.id })
            .from(documentJob)
            .where(
              and(
                eq(documentJob.documentId, document.id),
                inArray(documentJob.status, ["queued", "running"])
              )
            )
        )
      )
    )
    .limit(CLEANUP_BATCH_SIZE)
  await deleteR2Objects(
    env.FILEROUTER_FILES,
    expiredDocuments.map((stored) => stored.key)
  )
  if (expiredDocuments.length > 0) {
    await db
      .update(document)
      .set({ objectKey: null, status: "expired", updatedAt: now })
      .where(
        inArray(
          document.id,
          expiredDocuments.map((stored) => stored.id)
        )
      )
  }

  const oldJobs = await db
    .select({ id: documentJob.id })
    .from(documentJob)
    .where(lte(documentJob.createdAt, jobsCreatedBefore(now)))
    .limit(CLEANUP_BATCH_SIZE)
  let oldJobResultKeys: Array<string | null> = []
  if (oldJobs.length > 0) {
    const ids = oldJobs.map((job) => job.id)
    oldJobResultKeys = (
      await db
        .select({ key: documentExecution.resultKey })
        .from(documentExecution)
        .where(inArray(documentExecution.jobId, ids))
        .all()
    ).map((execution) => execution.key)
    await deleteR2Objects(env.FILEROUTER_FILES, oldJobResultKeys)
    await db.delete(documentJob).where(inArray(documentJob.id, ids))
  }

  const oldDocuments = await db
    .select({ id: document.id })
    .from(document)
    .where(
      and(
        eq(document.status, "expired"),
        lte(document.createdAt, jobsCreatedBefore(now)),
        notExists(
          db
            .select({ id: documentJob.id })
            .from(documentJob)
            .where(eq(documentJob.documentId, document.id))
        )
      )
    )
    .limit(CLEANUP_BATCH_SIZE)
  if (oldDocuments.length > 0) {
    await db.delete(document).where(
      inArray(
        document.id,
        oldDocuments.map((stored) => stored.id)
      )
    )
  }

  return {
    deletedDocuments: oldDocuments.length,
    deletedJobs: oldJobs.length,
    deletedResults: expiredResults.length + oldJobResultKeys.length,
    expiredDocuments: expiredDocuments.length,
  }
}
