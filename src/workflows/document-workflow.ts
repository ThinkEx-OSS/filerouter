import { WorkflowEntrypoint } from "cloudflare:workers"
import type {
  WorkflowEvent,
  WorkflowStep,
  WorkflowStepConfig,
} from "cloudflare:workers"
import { and, eq, inArray } from "drizzle-orm"
import { FileRouterError, serializeProviderError } from "@file_router/sdk"
import type {
  FileRouterProvider,
  ParseOutput,
  ProviderInput,
  ProviderParseOptions,
} from "@file_router/sdk"
import type { ProviderId } from "@file_router/sdk/catalog"

import { documentExecution, documentJob } from "@/db/schema"
import { createDb } from "@/db/server"
import { trackManagedExecutionUsage } from "@/integrations/autumn/managed-execution"
import { captureServerTelemetry } from "@/integrations/posthog/server"
import { createProviderSourceUrl } from "@/lib/document-source.server"
import { resultExpiresAt } from "@/lib/document-retention"
import { createHostedProviders } from "@/lib/hosted-providers.server"
import { emitWideEvent, serializeError } from "@/observability/log"
import {
  storeProviderResult,
  type ProviderOutcome,
} from "@/workflows/document-results"

export interface DocumentWorkflowTarget {
  executionId: string
  includeRaw: boolean
  options?: Record<string, unknown>
  outputs: Array<ParseOutput>
  pages?: Array<number>
  provider: ProviderId
}

export interface DocumentWorkflowParams {
  document: { fileName: string; id: string }
  jobId: string
  requestId: string
  targets: Array<DocumentWorkflowTarget>
  userId: string
}

const PROVIDER_EXECUTION_STEP = {
  retries: { backoff: "constant", delay: 0, limit: 1 },
  timeout: "15 minutes",
} as const satisfies WorkflowStepConfig

const PROVIDER_STATUS_STEP = {
  retries: { backoff: "exponential", delay: "10 seconds", limit: 3 },
  timeout: "1 minute",
} as const satisfies WorkflowStepConfig

const METERING_STEP = {
  retries: { backoff: "exponential", delay: "5 seconds", limit: 5 },
  timeout: "1 minute",
} as const satisfies WorkflowStepConfig

type ProviderStepStatus =
  | { status: "pending" | "running" }
  | { error: string; status: "failed" }
  | Extract<ProviderOutcome, { status: "parsed" }>

type MeteringOutcome =
  | { status: "failed"; error: string }
  | { status: "skipped" }
  | { status: "tracked"; trackedProviders: number }

export class DocumentWorkflow extends WorkflowEntrypoint<
  Cloudflare.Env,
  DocumentWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<DocumentWorkflowParams>>,
    step: WorkflowStep
  ) {
    const params = event.payload
    assertParams(params)
    const observedStartedAt = Date.now()
    let providerResults: Array<ProviderOutcome> = []
    let metering: MeteringOutcome = { status: "skipped" }
    let failure: unknown

    try {
      await markRunning(step, this.env.DB, params)
      const configured = createHostedProviders(this.env, {
        jobId: params.jobId,
        requestId: params.requestId,
      })
      const input: ProviderInput = {
        kind: "url",
        url: await createProviderSourceUrl(
          this.env,
          params.document.id,
          params.document.fileName
        ),
      }
      providerResults = await Promise.all(
        params.targets.map((target) =>
          processExecution(
            step,
            configured[target.provider],
            target,
            input,
            this.env
          )
        )
      )
      const status = await finalizeJob(
        step,
        this.env.DB,
        params,
        providerResults
      )
      metering = await trackUsage(step, this.env, params, providerResults)

      return { status }
    } catch (error) {
      failure = error
      await markWorkflowFailure(step, this.env.DB, params.jobId, error)
      throw error
    } finally {
      emitCompletionTelemetry(
        this.env,
        this.ctx,
        params,
        providerResults,
        metering,
        observedStartedAt,
        failure
      )
    }
  }
}

async function markRunning(
  step: WorkflowStep,
  database: D1Database,
  params: DocumentWorkflowParams
): Promise<void> {
  await step.do("mark job running", async () => {
    const now = new Date()
    const db = createDb(database)
    await db.batch([
      db
        .update(documentJob)
        .set({ status: "running", updatedAt: now })
        .where(eq(documentJob.id, params.jobId)),
      db
        .update(documentExecution)
        .set({ status: "running", updatedAt: now })
        .where(eq(documentExecution.jobId, params.jobId)),
    ])
  })
}

async function processExecution(
  step: WorkflowStep,
  provider: FileRouterProvider,
  target: DocumentWorkflowTarget,
  input: ProviderInput,
  env: Cloudflare.Env
): Promise<ProviderOutcome> {
  const startedAt = Date.now()
  let outcome: ProviderOutcome

  try {
    outcome = provider.jobs
      ? await processAsyncProvider(step, provider, target, input, env)
      : await step.do(
          `process ${target.executionId}`,
          PROVIDER_EXECUTION_STEP,
          async () =>
            storeProviderResult(
              env.FILEROUTER_FILES,
              target.executionId,
              await provider.parse(input, parseOptions(target))
            )
        )
  } catch (error) {
    outcome = {
      durationMs: Date.now() - startedAt,
      error: serializeProviderError(error),
      executionId: target.executionId,
      provider: provider.id,
      status: "failed",
    }
  }

  await recordExecution(step, env.DB, outcome)
  return outcome
}

async function processAsyncProvider(
  step: WorkflowStep,
  provider: FileRouterProvider,
  target: DocumentWorkflowTarget,
  input: ProviderInput,
  env: Cloudflare.Env
): Promise<Extract<ProviderOutcome, { status: "parsed" }>> {
  const jobs = provider.jobs
  if (!jobs) {
    throw new Error(`Provider ${provider.id} does not support durable jobs.`)
  }
  const job = await step.do(
    `submit ${target.executionId}`,
    PROVIDER_EXECUTION_STEP,
    () => jobs.submit(input, parseOptions(target))
  )
  const deadline = new Date(job.submittedAt).getTime() + 14 * 60 * 1000
  let attempt = 0

  while (Date.now() < deadline) {
    attempt += 1
    const status: ProviderStepStatus = await step.do(
      `check ${target.executionId} ${attempt}`,
      PROVIDER_STATUS_STEP,
      async () => {
        const current = await jobs.get(job, parseOptions(target))
        if (current.status !== "complete") {
          return current
        }
        return storeProviderResult(
          env.FILEROUTER_FILES,
          target.executionId,
          current.result
        )
      }
    )
    if (status.status === "parsed") {
      return status
    }
    if (status.status === "failed") {
      throw new FileRouterError(status.error, {
        code: "ParseFailed",
        providerId: provider.id,
      })
    }
    await step.sleep(`wait for ${target.executionId} ${attempt}`, "10 seconds")
  }

  throw new FileRouterError(`${provider.id} job timed out.`, {
    code: "Timeout",
    providerId: provider.id,
  })
}

async function recordExecution(
  step: WorkflowStep,
  database: D1Database,
  outcome: ProviderOutcome
): Promise<void> {
  await step.do(`record ${outcome.executionId}`, async () => {
    const completedAt = new Date()
    await createDb(database)
      .update(documentExecution)
      .set(
        outcome.status === "parsed"
          ? {
              completedAt,
              durationMs: outcome.durationMs,
              pageCount: outcome.pageCount,
              resultExpiresAt: resultExpiresAt(completedAt),
              resultKey: outcome.resultKey,
              status: "complete",
              updatedAt: completedAt,
              usage: outcome.usage,
            }
          : {
              completedAt,
              durationMs: outcome.durationMs,
              errorCode: outcome.error.code,
              errorMessage: outcome.error.message,
              status: outcome.status,
              updatedAt: completedAt,
            }
      )
      .where(eq(documentExecution.id, outcome.executionId))
  })
}

async function finalizeJob(
  step: WorkflowStep,
  database: D1Database,
  params: DocumentWorkflowParams,
  outcomes: Array<ProviderOutcome>
): Promise<"complete" | "failed"> {
  const successful = outcomes.filter(
    (outcome): outcome is Extract<ProviderOutcome, { status: "parsed" }> =>
      outcome.status === "parsed"
  )
  const status = successful.length > 0 ? "complete" : "failed"
  const error = status === "failed" ? "All provider executions failed." : null
  await step.do("finalize job", async () => {
    await createDb(database)
      .update(documentJob)
      .set({ error, status, updatedAt: new Date() })
      .where(eq(documentJob.id, params.jobId))
  })
  return status
}

async function trackUsage(
  step: WorkflowStep,
  env: Cloudflare.Env,
  params: DocumentWorkflowParams,
  providers: Array<ProviderOutcome>
): Promise<MeteringOutcome> {
  try {
    const result = await step.do("track managed execution", METERING_STEP, () =>
      trackManagedExecutionUsage(env, {
        jobId: params.jobId,
        providers,
        userId: params.userId,
      })
    )
    if ("skipped" in result) {
      await recordMeteringStatus(step, env.DB, params.jobId, "skipped")
      return { status: "skipped" }
    }
    if (result.unpricedProviders.length > 0) {
      throw new Error(
        `Cannot bill unpriced hosted providers: ${result.unpricedProviders.join(", ")}.`
      )
    }
    await recordMeteringStatus(step, env.DB, params.jobId, "tracked")
    return { status: "tracked", trackedProviders: result.trackedProviders }
  } catch (error) {
    await recordMeteringStatus(step, env.DB, params.jobId, "failed")
    return { status: "failed", error: errorMessage(error) }
  }
}

async function recordMeteringStatus(
  step: WorkflowStep,
  database: D1Database,
  jobId: string,
  status: "failed" | "skipped" | "tracked"
): Promise<void> {
  await step.do(`record metering ${status}`, async () => {
    await createDb(database)
      .update(documentJob)
      .set({ meteringStatus: status, updatedAt: new Date() })
      .where(eq(documentJob.id, jobId))
  })
}

async function markWorkflowFailure(
  step: WorkflowStep,
  database: D1Database,
  jobId: string,
  error: unknown
): Promise<void> {
  await step.do("record workflow failure", async () => {
    const now = new Date()
    const message = errorMessage(error)
    const db = createDb(database)
    await db.batch([
      db
        .update(documentExecution)
        .set({
          completedAt: now,
          errorMessage: message,
          status: "failed",
          updatedAt: now,
        })
        .where(
          and(
            eq(documentExecution.jobId, jobId),
            inArray(documentExecution.status, ["queued", "running"])
          )
        ),
      db
        .update(documentJob)
        .set({ error: message, status: "failed", updatedAt: now })
        .where(
          and(
            eq(documentJob.id, jobId),
            inArray(documentJob.status, ["queued", "running"])
          )
        ),
    ])
  })
}

function parseOptions(target: DocumentWorkflowTarget) {
  return {
    includeRaw: target.includeRaw,
    outputs: target.outputs,
    ...(target.pages && { pages: target.pages }),
    provider: target.provider,
    ...(target.options && {
      providerOptions: {
        [target.provider]: target.options,
      } satisfies ProviderParseOptions,
    }),
  }
}

function emitCompletionTelemetry(
  env: Cloudflare.Env,
  context: ExecutionContext,
  params: DocumentWorkflowParams,
  providerResults: Array<ProviderOutcome>,
  metering: MeteringOutcome,
  observedStartedAt: number,
  failure: unknown
): void {
  const parsedProviders = providerResults.filter(
    (provider) => provider.status === "parsed"
  )
  const completionProperties = {
    duration_ms: Date.now() - observedStartedAt,
    failed_provider_count: providerResults.length - parsedProviders.length,
    job_id: params.jobId,
    metering_status: metering.status,
    outcome: failure
      ? "failed"
      : parsedProviders.length > 0
        ? "complete"
        : "failed",
    page_count: Math.max(
      0,
      ...parsedProviders.map((provider) => provider.pageCount)
    ),
    provider_count: providerResults.length,
    providers: providerResults.map((provider) => provider.provider),
    request_id: params.requestId,
    successful_provider_count: parsedProviders.length,
  }
  emitWideEvent(
    env,
    failure || parsedProviders.length === 0 ? "error" : "info",
    {
      ...completionProperties,
      event: "document_job_completed",
      metering,
      provider_outcomes: providerResults.map(providerLogFields),
      service: "filerouter-workflow",
      user_id: params.userId,
      ...(failure ? serializeError(failure) : {}),
    }
  )
  context.waitUntil(
    captureServerTelemetry(env, {
      distinctId: params.userId,
      event: "document_job_completed",
      ...(failure ? { exception: failure } : {}),
      properties: completionProperties,
    })
  )
}

function providerLogFields(provider: ProviderOutcome) {
  return provider.status === "parsed"
    ? {
        duration_ms: provider.durationMs,
        engine: provider.engine,
        execution_id: provider.executionId,
        page_count: provider.pageCount,
        provider: provider.provider,
        status: provider.status,
        usage: provider.usage,
      }
    : {
        duration_ms: provider.durationMs,
        error_code: provider.error.code,
        error_message: provider.error.message,
        execution_id: provider.executionId,
        provider: provider.provider,
        status: provider.status,
      }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Document job failed."
}

function assertParams(params: Readonly<DocumentWorkflowParams>): void {
  if (
    !params.document.id ||
    !params.jobId ||
    !params.requestId ||
    !params.userId ||
    params.targets.length === 0
  ) {
    throw new Error("Invalid document workflow payload.")
  }
}
