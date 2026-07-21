import { and, eq } from "drizzle-orm"
import type { HostedJobStatus } from "@file_router/sdk/hosted"

import { documentJob } from "@/db/schema"
import { createDb } from "@/db/server"
import { readDocumentJobInput } from "@/lib/document-job-input.server"
import {
  MAX_HOSTED_UPLOAD_BYTES,
  MAX_HOSTED_UPLOAD_LABEL,
} from "@/lib/document-limits"
import { HttpError } from "@/lib/http.server"
import { hashToken } from "@/lib/tokens.server"
import { emitWideEvent, serializeError } from "@/observability/log"
import type { DocumentWorkflowParams } from "@/workflows/document-workflow"

type CreateDocumentJobResult = {
  job: {
    id: string
    status: HostedJobStatus
  }
  replayed: boolean
}

export async function createDocumentJob(
  request: Request,
  userId: string,
  env: Cloudflare.Env,
  idempotencyKey: string,
  requestId: string,
  validatedJson?: unknown
): Promise<CreateDocumentJobResult> {
  const input = await readDocumentJobInput(request, validatedJson)
  const db = createDb(env.DB)
  const id = crypto.randomUUID()
  const sourceKey = `jobs/${id}/source`
  const workflowSource: DocumentWorkflowParams["source"] = {
    key: sourceKey,
    ...(input.source.kind === "url" && { url: input.source.url }),
  }
  let sourceOwnedByJob = false
  try {
    const [idempotencyKeyHash, storedSource] = await Promise.all([
      hashToken(idempotencyKey),
      storeUploadedSource(input, sourceKey, env.FILEROUTER_FILES),
    ])
    if (storedSource?.size === 0) {
      throw new HttpError(400, "Document is empty.", {
        code: "empty_document",
      })
    }
    if (storedSource && storedSource.size > MAX_HOSTED_UPLOAD_BYTES) {
      throw new HttpError(
        413,
        `Hosted uploads are limited to ${MAX_HOSTED_UPLOAD_LABEL}.`,
        { code: "upload_too_large" }
      )
    }
    const requestHash = await hashToken(
      JSON.stringify({
        contentType:
          input.source.kind === "upload" ? input.source.contentType : undefined,
        fileName: input.source.fileName,
        includeRaw: input.includeRaw,
        operation: input.operation,
        outputs: input.outputs,
        pages: input.pages,
        providerOptions: input.providerOptions,
        providers: input.providers,
        sourceChecksum: storedSource?.checksum,
        sourceKind: input.source.kind,
        sourceUrl: input.source.kind === "url" ? input.source.url : undefined,
      })
    )
    const replay = await replayDocumentJob(
      userId,
      idempotencyKeyHash,
      requestHash,
      db
    )
    if (replay) {
      return replay
    }

    try {
      await db.insert(documentJob).values({
        createdAt: new Date(),
        fileName: input.source.fileName,
        id,
        idempotencyKeyHash,
        operation: input.operation,
        outputs: input.outputs,
        providers: input.providers,
        requestHash,
        sourceKey,
        sourceUrl: input.source.kind === "url" ? input.source.url : null,
        status: "queued",
        updatedAt: new Date(),
        userId,
      })
    } catch (error) {
      const racedJob = await replayDocumentJob(
        userId,
        idempotencyKeyHash,
        requestHash,
        db
      )
      if (racedJob) {
        return racedJob
      }
      throw error
    }

    const params: DocumentWorkflowParams = {
      fileName: input.source.fileName,
      includeRaw: input.includeRaw,
      jobId: id,
      operation: input.operation,
      outputs: input.outputs,
      ...(input.pages && { pages: input.pages }),
      providers: input.providers,
      requestId,
      source: workflowSource,
      userId,
      ...(input.providerOptions && { providerOptions: input.providerOptions }),
    }
    try {
      await env.DOCUMENT_WORKFLOW.create({
        id,
        params,
        retention: {
          errorRetention: "7 days",
          successRetention: "1 day",
        },
      })
    } catch (error) {
      await db.delete(documentJob).where(eq(documentJob.id, id))
      throw error
    }

    sourceOwnedByJob = true
    return { job: { id, status: "queued" }, replayed: false }
  } finally {
    if (!sourceOwnedByJob) {
      await env.FILEROUTER_FILES.delete(sourceKey).catch((error: unknown) => {
        emitWideEvent(env, "error", {
          event: "document_source_cleanup_failed",
          job_id: id,
          request_id: requestId,
          service: "filerouter-api",
          ...serializeError(error),
        })
      })
    }
  }
}

async function storeUploadedSource(
  input: Awaited<ReturnType<typeof readDocumentJobInput>>,
  sourceKey: string,
  bucket: R2Bucket
): Promise<{ checksum: string; size: number } | undefined> {
  if (input.source.kind !== "upload") {
    return undefined
  }

  const object = await bucket.put(sourceKey, input.source.body, {
    httpMetadata: { contentType: input.source.contentType },
    customMetadata: { fileName: input.source.fileName },
  })
  return {
    checksum: object.checksums.md5
      ? bytesToHex(object.checksums.md5)
      : object.etag,
    size: object.size,
  }
}

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

export async function getDocumentJobResponse(
  id: string,
  userId: string,
  env: Cloudflare.Env,
  requestId: string
) {
  const job = await createDb(env.DB)
    .select()
    .from(documentJob)
    .where(and(eq(documentJob.id, id), eq(documentJob.userId, userId)))
    .get()

  if (!job) {
    throw new HttpError(404, "Document job not found.")
  }
  if (job.status === "failed") {
    return {
      id,
      status: "failed" as const,
      error: job.error ?? "Document job failed.",
    }
  }
  if (job.status !== "complete") {
    return { id, status: job.status }
  }
  if (job.resultExpiresAt && job.resultExpiresAt <= new Date()) {
    if (job.resultKey) {
      try {
        await env.FILEROUTER_FILES.delete(job.resultKey)
        await createDb(env.DB)
          .update(documentJob)
          .set({ resultKey: null })
          .where(eq(documentJob.id, job.id))
      } catch (error) {
        emitWideEvent(env, "error", {
          event: "document_result_cleanup_failed",
          job_id: job.id,
          request_id: requestId,
          service: "filerouter-api",
          ...serializeError(error),
        })
      }
    }
    throw new HttpError(410, "Document job result has expired.", {
      code: "result_expired",
    })
  }
  if (!job.resultKey) {
    throw new HttpError(500, "Document job result is unavailable.")
  }

  const result = await env.FILEROUTER_FILES.get(job.resultKey)
  if (!result) {
    throw new HttpError(500, "Document job result is unavailable.")
  }
  return streamCompletedJob(id, result)
}

function streamCompletedJob(id: string, result: R2ObjectBody): Response {
  const encoder = new TextEncoder()
  const prefix = encoder.encode(`{"id":${JSON.stringify(id)},"result":`)
  const suffix = encoder.encode(',"status":"complete"}')
  const reader = result.body.getReader()
  let phase: "body" | "done" | "prefix" = "prefix"
  let readerReleased = false
  const releaseReader = () => {
    if (!readerReleased) {
      readerReleased = true
      reader.releaseLock()
    }
  }

  return new Response(
    new ReadableStream<Uint8Array>({
      async cancel(reason) {
        phase = "done"
        try {
          await reader.cancel(reason)
        } finally {
          releaseReader()
        }
      },
      async pull(controller) {
        if (phase === "prefix") {
          phase = "body"
          controller.enqueue(prefix)
          return
        }
        if (readerReleased) {
          return
        }

        let chunk: ReadableStreamReadResult<Uint8Array>
        try {
          chunk = await reader.read()
        } catch (error) {
          phase = "done"
          releaseReader()
          throw error
        }
        if (phase === "done") {
          return
        }
        if (chunk.done) {
          phase = "done"
          controller.enqueue(suffix)
          controller.close()
          releaseReader()
          return
        }
        controller.enqueue(chunk.value)
      },
    }),
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/json",
      },
    }
  )
}

async function replayDocumentJob(
  userId: string,
  idempotencyKeyHash: string,
  requestHash: string,
  db: ReturnType<typeof createDb>
): Promise<CreateDocumentJobResult | undefined> {
  const job = await db
    .select({
      id: documentJob.id,
      requestHash: documentJob.requestHash,
      status: documentJob.status,
    })
    .from(documentJob)
    .where(
      and(
        eq(documentJob.userId, userId),
        eq(documentJob.idempotencyKeyHash, idempotencyKeyHash)
      )
    )
    .get()
  if (!job) {
    return undefined
  }
  if (job.requestHash !== requestHash) {
    throw new HttpError(
      409,
      "Idempotency key was already used for a different request.",
      { code: "idempotency_conflict" }
    )
  }
  return {
    job: { id: job.id, status: job.status },
    replayed: true,
  }
}
