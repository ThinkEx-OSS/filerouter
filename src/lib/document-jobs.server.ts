import { and, eq } from "drizzle-orm"
import { assertProviderOutputs } from "@file_router/sdk"
import type { HostedJobCreateInput, ParseOutput } from "@file_router/sdk"
import type { ProviderId } from "@file_router/sdk/catalog"
import type {
  HostedExecution,
  HostedJob,
  HostedJobAccepted,
} from "@file_router/sdk/hosted"

import { document, documentExecution, documentJob } from "@/db/schema"
import { createDb } from "@/db/server"
import { requireHostedCreditForUser } from "@/integrations/autumn/billing.server"
import {
  createHostedProviders,
  validateHostedProviderOptions,
} from "@/lib/hosted-providers.server"
import { HttpError } from "@/lib/http.server"
import { hashToken } from "@/lib/tokens.server"
import type { DocumentWorkflowParams } from "@/workflows/document-workflow"

export interface CreateJobResult {
  job: HostedJobAccepted
  replayed: boolean
}

interface NormalizedTarget {
  executionId: string
  includeRaw: boolean
  options?: Record<string, unknown>
  outputs: Array<ParseOutput>
  pages?: Array<number>
  position: number
  provider: ProviderId
}

export async function createDocumentJob(
  input: HostedJobCreateInput,
  userId: string,
  env: Cloudflare.Env,
  idempotencyKey: string,
  requestId: string
): Promise<CreateJobResult> {
  const db = createDb(env.DB)
  const storedDocument = await db
    .select()
    .from(document)
    .where(and(eq(document.id, input.documentId), eq(document.userId, userId)))
    .get()
  if (!storedDocument) {
    throw new HttpError(404, "Document not found.", {
      code: "document_not_found",
    })
  }
  if (storedDocument.status !== "ready" || !storedDocument.objectKey) {
    throw new HttpError(410, "Document has expired.", {
      code: "document_expired",
    })
  }

  const jobId = crypto.randomUUID()
  const outputs = [...new Set(input.outputs)]
  const targets = normalizeTargets(input, outputs)
  validateTargets(targets, env, jobId, requestId)
  const idempotencyKeyHash = await hashToken(idempotencyKey)
  const requestHash = await hashToken(
    JSON.stringify({
      documentId: input.documentId,
      metadata: input.metadata,
      providers: targets.map(
        ({ executionId: _, position: __, ...target }) => target
      ),
    })
  )
  const replay = await replayJob(userId, idempotencyKeyHash, requestHash, db)
  if (replay) {
    return replay
  }

  await requireHostedCreditForUser(env, userId)

  const now = new Date()
  try {
    await db.batch([
      db.insert(documentJob).values({
        createdAt: now,
        documentId: input.documentId,
        id: jobId,
        idempotencyKeyHash,
        metadata: input.metadata,
        requestHash,
        status: "queued",
        updatedAt: now,
        userId,
      }),
      ...targets.map((target) =>
        db.insert(documentExecution).values({
          createdAt: now,
          id: target.executionId,
          includeRaw: target.includeRaw,
          jobId,
          options: target.options,
          outputs: target.outputs,
          pages: target.pages,
          position: target.position,
          provider: target.provider,
          status: "queued",
          updatedAt: now,
        })
      ),
    ])
  } catch (error) {
    const raced = await replayJob(userId, idempotencyKeyHash, requestHash, db)
    if (raced) {
      return raced
    }
    throw error
  }

  const params: DocumentWorkflowParams = {
    document: {
      fileName: storedDocument.fileName,
      id: storedDocument.id,
    },
    jobId,
    requestId,
    targets: targets.map(({ position: _, ...target }) => target),
    userId,
  }
  try {
    await startDocumentWorkflow(env.DOCUMENT_WORKFLOW, jobId, params)
  } catch (error) {
    await db.delete(documentJob).where(eq(documentJob.id, jobId))
    throw error
  }

  return { job: { id: jobId, status: "queued" }, replayed: false }
}

export async function getDocumentJob(
  id: string,
  userId: string,
  env: Cloudflare.Env
): Promise<HostedJob> {
  const db = createDb(env.DB)
  const job = await db
    .select()
    .from(documentJob)
    .where(and(eq(documentJob.id, id), eq(documentJob.userId, userId)))
    .get()
  if (!job) {
    throw new HttpError(404, "Document job not found.", {
      code: "job_not_found",
    })
  }
  const executions = await db
    .select()
    .from(documentExecution)
    .where(eq(documentExecution.jobId, id))
    .orderBy(documentExecution.position)
    .all()
  return {
    createdAt: job.createdAt.toISOString(),
    documentId: job.documentId,
    ...(job.error && { error: job.error }),
    executions: executions.map(serializeExecution),
    id: job.id,
    ...(job.metadata && { metadata: job.metadata }),
    status: job.status,
    updatedAt: job.updatedAt.toISOString(),
  }
}

export async function getExecutionResult(
  executionId: string,
  userId: string,
  env: Cloudflare.Env
): Promise<Response> {
  const row = await createDb(env.DB)
    .select({ execution: documentExecution, job: documentJob })
    .from(documentExecution)
    .innerJoin(documentJob, eq(documentExecution.jobId, documentJob.id))
    .where(
      and(eq(documentExecution.id, executionId), eq(documentJob.userId, userId))
    )
    .get()
  if (!row) {
    throw new HttpError(404, "Execution not found.", {
      code: "execution_not_found",
    })
  }
  if (row.execution.status !== "complete" || !row.execution.resultKey) {
    throw new HttpError(404, "Execution result is not available.", {
      code: "result_not_available",
    })
  }
  if (
    row.execution.resultExpiresAt &&
    row.execution.resultExpiresAt <= new Date()
  ) {
    throw new HttpError(410, "Execution result has expired.", {
      code: "result_expired",
    })
  }
  const object = await env.FILEROUTER_FILES.get(row.execution.resultKey)
  if (!object) {
    throw new HttpError(410, "Execution result has expired.", {
      code: "result_expired",
    })
  }
  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json",
    },
  })
}

function normalizeTargets(
  input: HostedJobCreateInput,
  defaultOutputs: Array<ParseOutput>
): Array<NormalizedTarget> {
  return input.providers.map((target, position) => ({
    executionId: crypto.randomUUID(),
    includeRaw: target.includeRaw ?? false,
    ...(target.options && { options: target.options }),
    outputs: [...new Set(target.outputs ?? defaultOutputs)],
    ...(target.pages && { pages: [...new Set(target.pages)] }),
    position,
    provider: target.provider,
  }))
}

function validateTargets(
  targets: Array<NormalizedTarget>,
  env: Cloudflare.Env,
  jobId: string,
  requestId: string
): void {
  const configured = createHostedProviders(env, { jobId, requestId })
  for (const target of targets) {
    const provider = configured[target.provider]
    try {
      assertProviderOutputs(provider, target.outputs)
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Unsupported provider output.",
        { code: "unsupported_provider_output" }
      )
    }
    if (target.options) {
      validateHostedProviderOptions(target.provider, target.options)
    }
  }
}

function serializeExecution(
  execution: typeof documentExecution.$inferSelect
): HostedExecution {
  return {
    ...(execution.completedAt && {
      completedAt: execution.completedAt.toISOString(),
    }),
    createdAt: execution.createdAt.toISOString(),
    ...(execution.durationMs !== null && {
      durationMs: execution.durationMs,
    }),
    ...(execution.errorMessage && {
      error: {
        ...(execution.errorCode && { code: execution.errorCode }),
        message: execution.errorMessage,
      },
    }),
    id: execution.id,
    jobId: execution.jobId,
    outputs: execution.outputs,
    ...(execution.pageCount !== null && { pageCount: execution.pageCount }),
    provider: execution.provider,
    resultAvailable: execution.status === "complete" && !!execution.resultKey,
    ...(execution.resultExpiresAt && {
      resultExpiresAt: execution.resultExpiresAt.toISOString(),
    }),
    status: execution.status,
    ...(execution.usage && { usage: execution.usage }),
  }
}

async function startDocumentWorkflow(
  workflow: Cloudflare.Env["DOCUMENT_WORKFLOW"],
  id: string,
  params: DocumentWorkflowParams
): Promise<void> {
  try {
    await workflow.create({
      id,
      params,
      retention: { errorRetention: "7 days", successRetention: "1 day" },
    })
  } catch (error) {
    try {
      await workflow.get(id)
    } catch {
      throw error
    }
  }
}

async function replayJob(
  userId: string,
  idempotencyKeyHash: string,
  requestHash: string,
  db: ReturnType<typeof createDb>
): Promise<CreateJobResult | undefined> {
  const existing = await db
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
  if (!existing) {
    return undefined
  }
  if (existing.requestHash !== requestHash) {
    throw new HttpError(
      409,
      "Idempotency key was already used for a different job.",
      { code: "idempotency_conflict" }
    )
  }
  return {
    job: { id: existing.id, status: existing.status },
    replayed: true,
  }
}
