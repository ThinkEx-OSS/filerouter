import { and, eq, inArray, isNotNull, lte, or } from "drizzle-orm"

import { documentJob } from "@/db/schema"
import { createDb } from "@/db/server"
import { jobsCreatedBefore } from "@/lib/document-retention"

const CLEANUP_BATCH_SIZE = 100

export interface DocumentRetentionCleanupResult {
  deletedJobs: number
  deletedResults: number
  deletedSources: number
}

export async function runDocumentRetentionCleanup(
  env: Cloudflare.Env,
  now = new Date()
): Promise<DocumentRetentionCleanupResult> {
  const db = createDb(env.DB)

  const terminalSources = await db
    .select({ id: documentJob.id, key: documentJob.sourceKey })
    .from(documentJob)
    .where(
      and(
        isNotNull(documentJob.sourceKey),
        or(eq(documentJob.status, "complete"), eq(documentJob.status, "failed"))
      )
    )
    .limit(CLEANUP_BATCH_SIZE)

  await deleteObjects(
    env.FILEROUTER_FILES,
    terminalSources.map((job) => job.key)
  )
  if (terminalSources.length > 0) {
    await db
      .update(documentJob)
      .set({ sourceKey: null })
      .where(
        inArray(
          documentJob.id,
          terminalSources.map((job) => job.id)
        )
      )
  }

  const expiredResults = await db
    .select({ id: documentJob.id, key: documentJob.resultKey })
    .from(documentJob)
    .where(
      and(
        isNotNull(documentJob.resultKey),
        isNotNull(documentJob.resultExpiresAt),
        lte(documentJob.resultExpiresAt, now)
      )
    )
    .limit(CLEANUP_BATCH_SIZE)

  await deleteObjects(
    env.FILEROUTER_FILES,
    expiredResults.map((job) => job.key)
  )
  if (expiredResults.length > 0) {
    await db
      .update(documentJob)
      .set({ resultKey: null })
      .where(
        inArray(
          documentJob.id,
          expiredResults.map((job) => job.id)
        )
      )
  }

  const oldJobs = await db
    .select({
      id: documentJob.id,
      resultKey: documentJob.resultKey,
      sourceKey: documentJob.sourceKey,
    })
    .from(documentJob)
    .where(lte(documentJob.createdAt, jobsCreatedBefore(now)))
    .limit(CLEANUP_BATCH_SIZE)

  await deleteObjects(
    env.FILEROUTER_FILES,
    oldJobs.flatMap((job) => [job.sourceKey, job.resultKey])
  )
  if (oldJobs.length > 0) {
    await db.delete(documentJob).where(
      inArray(
        documentJob.id,
        oldJobs.map((job) => job.id)
      )
    )
  }

  return {
    deletedJobs: oldJobs.length,
    deletedResults: expiredResults.length,
    deletedSources: terminalSources.length,
  }
}

async function deleteObjects(
  bucket: R2Bucket,
  keys: Array<string | null>
): Promise<void> {
  const uniqueKeys = [...new Set(keys.filter((key): key is string => !!key))]
  if (uniqueKeys.length > 0) {
    await bucket.delete(uniqueKeys)
  }
}
