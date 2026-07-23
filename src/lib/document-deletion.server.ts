import { and, eq, inArray } from "drizzle-orm"

import { document, documentExecution, documentJob } from "@/db/schema"
import { createDb } from "@/db/server"
import { HttpError } from "@/lib/http.server"
import { deleteR2Objects } from "@/lib/r2-objects.server"

export async function deleteDocument(
  id: string,
  userId: string,
  env: Cloudflare.Env
): Promise<void> {
  const db = createDb(env.DB)
  const stored = await db
    .select({ objectKey: document.objectKey })
    .from(document)
    .where(and(eq(document.id, id), eq(document.userId, userId)))
    .get()
  if (!stored) {
    throw new HttpError(404, "Document not found.", {
      code: "document_not_found",
    })
  }

  const jobs = await db
    .select({ id: documentJob.id, status: documentJob.status })
    .from(documentJob)
    .where(eq(documentJob.documentId, id))
    .all()
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

  await Promise.all(
    jobs
      .filter((job) => job.status === "queued" || job.status === "running")
      .map((job) => terminateWorkflow(env.DOCUMENT_WORKFLOW, job.id))
  )
  await deleteR2Objects(env.FILEROUTER_FILES, [stored.objectKey, ...resultKeys])
  await db.delete(document).where(eq(document.id, id))
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
