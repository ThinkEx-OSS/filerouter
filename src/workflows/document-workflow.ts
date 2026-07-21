import { WorkflowEntrypoint } from "cloudflare:workers"
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers"
import { and, eq } from "drizzle-orm"
import {
  FileRouterError,
  assertProviderOutputs,
  serializeProviderError,
} from "@file_router/sdk"
import type { ProviderId } from "@file_router/sdk/catalog"
import type {
  FileRouterProvider,
  ParseOutput,
  ProviderInput,
  ProviderParseOptions,
} from "@file_router/sdk"

import { documentJob } from "@/db/schema"
import { createDb } from "@/db/server"
import { trackManagedExecutionUsage } from "@/integrations/autumn/managed-execution"
import { captureServerTelemetry } from "@/integrations/posthog/server"
import { MAX_HOSTED_UPLOAD_BYTES } from "@/lib/document-limits"
import { createProviderSourceUrl } from "@/lib/document-source.server"
import { resultExpiresAt } from "@/lib/document-retention"
import { createHostedProviders } from "@/lib/hosted-providers.server"
import {
  storeComparisonResult,
  storeProviderResult,
} from "@/workflows/document-results"
import type { ProviderOutcome } from "@/workflows/document-results"
import { materializeDocumentSource } from "@/workflows/document-source"
import { emitWideEvent, serializeError } from "@/observability/log"

export interface DocumentWorkflowParams {
  fileName: string
  includeRaw: boolean
  jobId: string
  operation: "compare" | "parse"
  outputs: Array<ParseOutput>
  pages?: Array<number>
  providers: Array<ProviderId>
  providerOptions?: ProviderParseOptions
  requestId: string
  source: { key: string; url?: string }
  userId: string
}

const SINGLE_ATTEMPT = {
  retries: { backoff: "constant" as const, delay: 0, limit: 1 },
  timeout: "15 minutes" as const,
}

const RETRYABLE_CHECK = {
  retries: {
    backoff: "exponential" as const,
    delay: "10 seconds" as const,
    limit: 3,
  },
  timeout: "1 minute" as const,
}

const RETRYABLE_METERING = {
  retries: {
    backoff: "exponential" as const,
    delay: "5 seconds" as const,
    limit: 5,
  },
  timeout: "1 minute" as const,
}

type ProviderStepStatus =
  | { status: "pending" | "running" }
  | { error: string; status: "failed" }
  | Extract<ProviderOutcome, { status: "parsed" }>

type CleanupOutcome =
  | { status: "not_run" | "skipped" }
  | { object_count: number; status: "deleted" }
  | ({ status: "failed" } & ReturnType<typeof serializeError>)

type MeteringOutcome =
  | { status: "not_run" | "skipped" }
  | {
      status: "tracked"
      tracked_providers: number
      unpriced_providers: Array<string>
    }
  | ({ status: "failed" } & ReturnType<typeof serializeError>)

export class DocumentWorkflow extends WorkflowEntrypoint<
  Cloudflare.Env,
  DocumentWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<DocumentWorkflowParams>>,
    step: WorkflowStep
  ) {
    const params = assertParams(event.payload)
    const observedStartedAt = Date.now()
    let providerResults: Array<ProviderOutcome> = []
    let resultCleanup: CleanupOutcome = { status: "not_run" }
    let sourceCleanup: CleanupOutcome = { status: "not_run" }
    let metering: MeteringOutcome = { status: "not_run" }
    let pageCount: number | undefined
    let outcome: "complete" | "failed" = "failed"
    let failure: unknown

    try {
      const startedAt = await step.do("mark job running", async () => {
        const timestamp = new Date()
        await createDb(this.env.DB)
          .update(documentJob)
          .set({ status: "running", updatedAt: timestamp })
          .where(eq(documentJob.id, params.jobId))
        return timestamp.toISOString()
      })
      await step.do("materialize document source", SINGLE_ATTEMPT, () =>
        materializeDocumentSource(
          this.env.FILEROUTER_FILES,
          params.source,
          params.fileName
        )
      )
      const configured = createHostedProviders(this.env, {
        jobId: params.jobId,
        requestId: params.requestId,
      })
      const input = await sourceInput(this.env, params)
      providerResults = await Promise.all(
        params.providers.map((providerId) =>
          processProvider(step, configured[providerId], input, params, this.env)
        )
      )
      const stored = await persistResult(
        step,
        this.env.FILEROUTER_FILES,
        params,
        providerResults,
        startedAt
      )
      pageCount = stored.pageCount
      if (params.operation === "compare") {
        resultCleanup = await deleteResultObjects(
          step,
          this.env.FILEROUTER_FILES,
          providerResultKeys(providerResults),
          "delete comparison parts"
        )
      } else {
        resultCleanup = { status: "skipped" }
      }
      sourceCleanup = await deleteDocumentSource(
        step,
        this.env,
        params,
        "delete document source"
      )

      metering = await trackUsageWithoutFailingJob(
        step,
        this.env,
        params,
        providerResults
      )

      await step.do("mark job complete", async () => {
        const completedAt = new Date()
        await createDb(this.env.DB)
          .update(documentJob)
          .set({
            pageCount: stored.pageCount,
            resultKey: stored.resultKey,
            resultExpiresAt: resultExpiresAt(completedAt),
            ...(sourceCleanup.status === "deleted" && { sourceKey: null }),
            status: "complete",
            updatedAt: completedAt,
          })
          .where(eq(documentJob.id, params.jobId))
        return { status: "complete" }
      })

      outcome = "complete"
      return { status: "complete" as const }
    } catch (error) {
      failure = error
      const message = errorMessage(error)
      resultCleanup = await deleteResultObjects(
        step,
        this.env.FILEROUTER_FILES,
        [
          ...providerResultKeys(providerResults),
          `jobs/${params.jobId}/result.json`,
        ],
        "delete failed results"
      )
      sourceCleanup = await deleteDocumentSource(
        step,
        this.env,
        params,
        "delete failed document source"
      )
      await step.do("mark job failed", async () => {
        await createDb(this.env.DB)
          .update(documentJob)
          .set({
            error: message,
            ...(sourceCleanup.status === "deleted" && { sourceKey: null }),
            status: "failed",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(documentJob.id, params.jobId),
              eq(documentJob.status, "running")
            )
          )
        return { error: message, status: "failed" }
      })
      throw error
    } finally {
      const durationMs = Date.now() - observedStartedAt
      const providerOutcomes = providerResults.map(providerLogFields)
      const parsedProviders = providerResults.filter(
        (provider) => provider.status === "parsed"
      )
      const failedProviders = providerResults.length - parsedProviders.length
      emitWideEvent(this.env, outcome === "failed" ? "error" : "info", {
        duration_ms: durationMs,
        event: "document_job_completed",
        failed_provider_count: failedProviders,
        job_id: params.jobId,
        metering,
        operation: params.operation,
        outcome,
        page_count: pageCount,
        provider_count: providerResults.length,
        provider_outcomes: providerOutcomes,
        request_id: params.requestId,
        result_cleanup: resultCleanup,
        service: "filerouter-workflow",
        source_cleanup: sourceCleanup,
        successful_provider_count: parsedProviders.length,
        user_id: params.userId,
        ...(failure ? serializeError(failure) : {}),
      })

      const properties = {
        duration_ms: durationMs,
        failed_provider_count: failedProviders,
        job_id: params.jobId,
        metering_status: metering.status,
        operation: params.operation,
        outcome,
        page_count: pageCount,
        provider_count: providerResults.length,
        providers: providerResults.map((provider) => provider.provider),
        request_id: params.requestId,
        successful_provider_count: parsedProviders.length,
      }
      this.ctx.waitUntil(
        captureServerTelemetry(this.env, {
          distinctId: params.userId,
          event: "document_job_completed",
          ...(failure ? { exception: failure } : {}),
          properties,
        })
      )
    }
  }
}

async function trackUsageWithoutFailingJob(
  step: WorkflowStep,
  env: Cloudflare.Env,
  params: DocumentWorkflowParams,
  providers: Array<ProviderOutcome>
): Promise<MeteringOutcome> {
  try {
    const result = await step.do(
      "track managed execution",
      RETRYABLE_METERING,
      () =>
        trackManagedExecutionUsage(env, {
          jobId: params.jobId,
          operation: params.operation,
          providers,
          userId: params.userId,
        })
    )
    return "skipped" in result
      ? { status: "skipped" }
      : {
          status: "tracked",
          tracked_providers: result.trackedProviders,
          unpriced_providers: result.unpricedProviders,
        }
  } catch (error) {
    return { status: "failed", ...serializeError(error) }
  }
}

function providerResultKeys(results: Array<ProviderOutcome>): Array<string> {
  return results.flatMap((result) =>
    result.status === "parsed" ? [result.resultKey] : []
  )
}

async function deleteResultObjects(
  step: WorkflowStep,
  bucket: R2Bucket,
  keys: Array<string>,
  stepName: string
): Promise<CleanupOutcome> {
  if (keys.length === 0) {
    return { status: "skipped" }
  }
  try {
    await step.do(stepName, SINGLE_ATTEMPT, async () => {
      await bucket.delete(keys)
      return true
    })
    return { object_count: keys.length, status: "deleted" }
  } catch (error) {
    return { status: "failed", ...serializeError(error) }
  }
}

async function processProvider(
  step: WorkflowStep,
  provider: FileRouterProvider,
  input: ProviderInput,
  params: DocumentWorkflowParams,
  env: Cloudflare.Env
): Promise<ProviderOutcome> {
  const startedAt = Date.now()

  try {
    assertProviderOutputs(provider, params.outputs)
  } catch (error) {
    return {
      durationMs: Date.now() - startedAt,
      error: serializeProviderError(error),
      provider: provider.id,
      status: "unsupported",
    }
  }

  try {
    return provider.jobs
      ? await processAsyncProvider(step, provider, input, params, env)
      : await step.do(`process ${provider.id}`, SINGLE_ATTEMPT, async () =>
          storeProviderResult(
            env.FILEROUTER_FILES,
            params.jobId,
            await provider.parse(input, parseOptions(params, provider.id))
          )
        )
  } catch (error) {
    return {
      durationMs: Date.now() - startedAt,
      error: serializeProviderError(error),
      provider: provider.id,
      status: "failed",
    }
  }
}

async function processAsyncProvider(
  step: WorkflowStep,
  provider: FileRouterProvider,
  input: ProviderInput,
  params: DocumentWorkflowParams,
  env: Cloudflare.Env
): Promise<Extract<ProviderOutcome, { status: "parsed" }>> {
  const jobs = provider.jobs
  if (!jobs) {
    throw new Error(`Provider ${provider.id} does not support durable jobs.`)
  }

  const job = await step.do(`submit ${provider.id}`, SINGLE_ATTEMPT, async () =>
    jobs.submit(input, parseOptions(params, provider.id))
  )

  const deadline = new Date(job.submittedAt).getTime() + 14 * 60 * 1000
  while (Date.now() < deadline) {
    const status: ProviderStepStatus = await step.do(
      `check ${provider.id}`,
      RETRYABLE_CHECK,
      async () => {
        const current = await jobs.get(job, parseOptions(params, provider.id))
        if (current.status !== "complete") {
          return current
        }
        return storeProviderResult(
          env.FILEROUTER_FILES,
          params.jobId,
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
    await step.sleep(`wait for ${provider.id}`, "10 seconds")
  }

  throw new FileRouterError(`${provider.id} job timed out.`, {
    code: "Timeout",
    providerId: provider.id,
  })
}

async function persistResult(
  step: WorkflowStep,
  bucket: R2Bucket,
  params: DocumentWorkflowParams,
  providers: Array<ProviderOutcome>,
  startedAt: string
): Promise<{ pageCount: number; resultKey: string }> {
  if (params.operation === "parse") {
    const result = providers[0]
    if (!result || result.status !== "parsed") {
      throw new Error(result?.error.message ?? "Document parsing failed.")
    }
    return { pageCount: result.pageCount, resultKey: result.resultKey }
  }

  return step.do("store comparison", SINGLE_ATTEMPT, () =>
    storeComparisonResult(bucket, {
      fileName: params.fileName,
      jobId: params.jobId,
      outputs: params.outputs,
      providers,
      startedAt,
    })
  )
}

async function deleteDocumentSource(
  step: WorkflowStep,
  env: Cloudflare.Env,
  params: DocumentWorkflowParams,
  stepName: string
): Promise<CleanupOutcome> {
  const sourceKey = params.source.key
  try {
    await step.do(stepName, SINGLE_ATTEMPT, async () => {
      await env.FILEROUTER_FILES.delete(sourceKey)
      return true
    })
    return { object_count: 1, status: "deleted" }
  } catch (error) {
    return { status: "failed", ...serializeError(error) }
  }
}

function providerLogFields(provider: ProviderOutcome) {
  return provider.status === "parsed"
    ? {
        duration_ms: provider.durationMs,
        engine: provider.engine,
        page_count: provider.pageCount,
        provider: provider.provider,
        status: provider.status,
        usage: provider.usage,
      }
    : {
        duration_ms: provider.durationMs,
        error_code: provider.error.code,
        error_message: provider.error.message,
        provider: provider.provider,
        status: provider.status,
      }
}

function parseOptions(params: DocumentWorkflowParams, provider: string) {
  return {
    includeRaw: params.includeRaw,
    outputs: params.outputs,
    ...(params.pages && { pages: params.pages }),
    provider,
    ...(params.providerOptions && {
      providerOptions: params.providerOptions,
    }),
  }
}

async function sourceInput(
  env: Cloudflare.Env,
  params: DocumentWorkflowParams
): Promise<ProviderInput> {
  const object = await env.FILEROUTER_FILES.head(params.source.key)
  if (!object) {
    throw new Error("Uploaded document is unavailable.")
  }
  if (object.size > MAX_HOSTED_UPLOAD_BYTES) {
    throw new Error("Uploaded document exceeds the hosted size limit.")
  }
  return {
    kind: "url",
    url: await createProviderSourceUrl(env, params.jobId, params.fileName),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Document job failed."
}

function assertParams(
  params: Readonly<DocumentWorkflowParams>
): DocumentWorkflowParams {
  if (
    !params.jobId ||
    !params.requestId ||
    !params.userId ||
    params.providers.length === 0 ||
    params.outputs.length === 0 ||
    !params.source.key
  ) {
    throw new Error("Invalid document workflow payload.")
  }
  return { ...params }
}
