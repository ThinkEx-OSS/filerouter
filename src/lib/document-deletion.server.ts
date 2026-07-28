import { and, eq, inArray, notExists } from "drizzle-orm"

import { document, documentExecution, documentJob } from "@/db/schema"
import { createDb } from "@/db/server"
import { deleteR2Objects } from "@/lib/r2-objects.server"
import { HttpError } from "@/lib/http.server"

const activeJobStatuses = ["queued", "running"] as const

export async function releaseDocumentArtifacts(
  id: string,
  userId: string,
  env: Cloudflare.Env
): Promise<void> {
  const db = createDb(env.DB)
  const now = new Date()
  const activeJobs = db
    .select({ id: documentJob.id })
    .from(documentJob)
    .where(
      and(
        eq(documentJob.documentId, document.id),
        inArray(documentJob.status, activeJobStatuses)
      )
    )
  const releasable = await db
    .update(document)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(document.id, id),
        eq(document.userId, userId),
        notExists(activeJobs)
      )
    )
    .returning({ objectKey: document.objectKey })
    .get()
  if (!releasable) {
    const stored = await db
      .select({ id: document.id })
      .from(document)
      .where(and(eq(document.id, id), eq(document.userId, userId)))
      .get()
    if (!stored) {
      return
    }
    throw new HttpError(409, "Document still has active jobs.", {
      code: "document_active",
    })
  }

  const executions = await db
    .select({
      id: documentExecution.id,
      resultKey: documentExecution.resultKey,
    })
    .from(documentExecution)
    .innerJoin(documentJob, eq(documentExecution.jobId, documentJob.id))
    .where(eq(documentJob.documentId, id))
    .all()
  await deleteR2Objects(env.FILEROUTER_FILES, [
    releasable.objectKey,
    ...executions.map((execution) => execution.resultKey),
  ])

  const releaseDocument = db
    .update(document)
    .set({ objectKey: null, updatedAt: now })
    .where(and(eq(document.id, id), eq(document.userId, userId)))
  if (executions.length === 0) {
    await releaseDocument
    return
  }
  await db.batch([
    releaseDocument,
    db
      .update(documentExecution)
      .set({ resultExpiresAt: now, resultKey: null, updatedAt: now })
      .where(
        inArray(
          documentExecution.id,
          executions.map((execution) => execution.id)
        )
      ),
  ])
}

export async function deleteDocument(
  id: string,
  userId: string,
  env: Cloudflare.Env
): Promise<void> {
  const db = createDb(env.DB)
  const now = new Date()
  const stored = await db
    .update(document)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(document.id, id), eq(document.userId, userId)))
    .returning({ objectKey: document.objectKey })
    .get()
  if (!stored) {
    return
  }

  const jobs = await db
    .select({ id: documentJob.id, status: documentJob.status })
    .from(documentJob)
    .where(eq(documentJob.documentId, id))
    .all()

  await Promise.all(
    jobs
      .filter((job) => job.status === "queued" || job.status === "running")
      .map((job) => terminateWorkflow(env.DOCUMENT_WORKFLOW, job.id))
  )
  const jobIds = jobs.map((job) => job.id)
  const resultKeys =
    jobIds.length === 0
      ? []
      : (
          await db
            .select({ key: documentExecution.resultKey })
            .from(documentExecution)
            .where(inArray(documentExecution.jobId, jobIds))
            .all()
        ).map((execution) => execution.key)
  await deleteR2Objects(env.FILEROUTER_FILES, [stored.objectKey, ...resultKeys])
  await db
    .delete(document)
    .where(and(eq(document.id, id), eq(document.userId, userId)))
}

async function terminateWorkflow(
  workflow: Cloudflare.Env["DOCUMENT_WORKFLOW"],
  id: string
): Promise<void> {
  const instance = await workflow.get(id)
  const { status } = await instance.status()
  if (
    status === "queued" ||
    status === "running" ||
    status === "paused" ||
    status === "waiting" ||
    status === "waitingForPause"
  ) {
    await instance.terminate()
  }
}
