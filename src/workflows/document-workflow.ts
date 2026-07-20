import { WorkflowEntrypoint } from "cloudflare:workers"
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers"
import { and, eq } from "drizzle-orm"
import {
  FileRouterError,
  assertProviderOutputs,
  serializeProviderError,
} from "@file_router/sdk"
import { builtInProviders } from "@file_router/sdk/catalog"
import type { ProviderId } from "@file_router/sdk/catalog"
import type {
  FileRouterProvider,
  ParseOutput,
  ProviderInput,
  ProviderParseOptions,
} from "@file_router/sdk"

import { documentJob } from "@/db/schema"
import { createDb } from "@/db/server"
import {
  MAX_BUFFERED_PROVIDER_BYTES,
  MAX_HOSTED_UPLOAD_BYTES,
} from "@/lib/document-limits"
import {
  canProvidersReachSourceUrl,
  createProviderSourceUrl,
} from "@/lib/document-source.server"
import { resultExpiresAt } from "@/lib/document-retention"
import {
  storeComparisonResult,
  storeProviderResult,
} from "@/workflows/document-results"
import type { ProviderOutcome } from "@/workflows/document-results"

export interface DocumentWorkflowParams {
  fileName: string
  includeRaw: boolean
  jobId: string
  operation: "compare" | "parse"
  outputs: Array<ParseOutput>
  pages?: Array<number>
  providers: Array<ProviderId>
  providerOptions?: ProviderParseOptions
  source: { kind: "upload"; key: string } | { kind: "url"; url: string }
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

type ProviderStepStatus =
  | { status: "pending" | "running" }
  | { error: string; status: "failed" }
  | Extract<ProviderOutcome, { status: "parsed" }>

export class DocumentWorkflow extends WorkflowEntrypoint<
  Cloudflare.Env,
  DocumentWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<DocumentWorkflowParams>>,
    step: WorkflowStep
  ) {
    const params = assertParams(event.payload)
    let providerResults: Array<ProviderOutcome> = []
    const startedAt = await step.do("mark job running", async () => {
      const timestamp = new Date()
      await createDb(this.env.DB)
        .update(documentJob)
        .set({ status: "running", updatedAt: timestamp })
        .where(eq(documentJob.id, params.jobId))
      return timestamp.toISOString()
    })

    try {
      const configured = providers(this.env)
      providerResults = await Promise.all(
        params.providers.map((providerId) =>
          processProvider(step, configured[providerId], params, this.env)
        )
      )

      const stored = await persistResult(
        step,
        this.env.FILEROUTER_FILES,
        params,
        providerResults,
        startedAt
      )
      if (params.operation === "compare") {
        await deleteResultObjects(
          step,
          this.env.FILEROUTER_FILES,
          providerResultKeys(providerResults),
          "delete comparison parts",
          params.jobId
        )
      }
      const sourceDeleted = await deleteUploadedSource(
        step,
        this.env,
        params,
        "delete uploaded source"
      )

      await step.do("mark job complete", async () => {
        const completedAt = new Date()
        await createDb(this.env.DB)
          .update(documentJob)
          .set({
            pageCount: stored.pageCount,
            resultKey: stored.resultKey,
            resultExpiresAt: resultExpiresAt(completedAt),
            ...(sourceDeleted && { sourceKey: null }),
            status: "complete",
            updatedAt: completedAt,
          })
          .where(eq(documentJob.id, params.jobId))
        return { status: "complete" }
      })

      return { status: "complete" as const }
    } catch (error) {
      const message = errorMessage(error)
      await deleteResultObjects(
        step,
        this.env.FILEROUTER_FILES,
        [
          ...providerResultKeys(providerResults),
          `jobs/${params.jobId}/result.json`,
        ],
        "delete failed results",
        params.jobId
      )
      const sourceDeleted = await deleteUploadedSource(
        step,
        this.env,
        params,
        "delete failed uploaded source"
      )
      await step.do("mark job failed", async () => {
        await createDb(this.env.DB)
          .update(documentJob)
          .set({
            error: message,
            ...(sourceDeleted && { sourceKey: null }),
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
    }
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
  stepName: string,
  jobId: string
): Promise<void> {
  if (keys.length === 0) {
    return
  }
  try {
    await step.do(stepName, SINGLE_ATTEMPT, async () => {
      await bucket.delete(keys)
      return true
    })
  } catch (error) {
    console.error("Failed to delete document result objects", {
      error: errorMessage(error),
      jobId,
      keys,
    })
  }
}

async function processProvider(
  step: WorkflowStep,
  provider: FileRouterProvider,
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
      ? await processAsyncProvider(step, provider, params, env)
      : await step.do(`process ${provider.id}`, SINGLE_ATTEMPT, async () =>
          storeProviderResult(
            env.FILEROUTER_FILES,
            params.jobId,
            await provider.parse(
              await sourceInput(env, params),
              parseOptions(params, provider.id)
            )
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
  params: DocumentWorkflowParams,
  env: Cloudflare.Env
): Promise<Extract<ProviderOutcome, { status: "parsed" }>> {
  const jobs = provider.jobs
  if (!jobs) {
    throw new Error(`Provider ${provider.id} does not support durable jobs.`)
  }

  const job = await step.do(`submit ${provider.id}`, SINGLE_ATTEMPT, async () =>
    jobs.submit(
      await sourceInput(env, params),
      parseOptions(params, provider.id)
    )
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

async function deleteUploadedSource(
  step: WorkflowStep,
  env: Cloudflare.Env,
  params: DocumentWorkflowParams,
  stepName: string
): Promise<boolean> {
  if (params.source.kind !== "upload") {
    return false
  }
  const sourceKey = params.source.key
  try {
    return await step.do(stepName, SINGLE_ATTEMPT, async () => {
      await env.FILEROUTER_FILES.delete(sourceKey)
      return true
    })
  } catch (error) {
    console.error("Failed to delete uploaded document source", {
      error: errorMessage(error),
      jobId: params.jobId,
      sourceKey,
    })
    return false
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

function providers(
  env: Cloudflare.Env
): Record<ProviderId, FileRouterProvider> {
  return builtInProviders({
    datalabApiKey: env.DATALAB_API_KEY,
    llamaCloudApiKey: env.LLAMA_CLOUD_API_KEY,
    mistralApiKey: env.MISTRAL_API_KEY,
  })
}

async function sourceInput(
  env: Cloudflare.Env,
  params: DocumentWorkflowParams
): Promise<ProviderInput> {
  if (params.source.kind === "url") {
    return { kind: "url", url: params.source.url }
  }
  const object = await env.FILEROUTER_FILES.head(params.source.key)
  if (!object) {
    throw new Error("Uploaded document is unavailable.")
  }
  if (object.size > MAX_HOSTED_UPLOAD_BYTES) {
    throw new Error("Uploaded document exceeds the hosted size limit.")
  }
  if (canProvidersReachSourceUrl(env.BETTER_AUTH_URL)) {
    return {
      kind: "url",
      url: await createProviderSourceUrl(env, params.jobId, params.fileName),
    }
  }
  if (object.size > MAX_BUFFERED_PROVIDER_BYTES) {
    throw new Error(
      "Large local hosted uploads require a publicly reachable BETTER_AUTH_URL."
    )
  }
  const body = await env.FILEROUTER_FILES.get(params.source.key)
  if (!body) {
    throw new Error("Uploaded document is unavailable.")
  }
  const mimeType =
    object.httpMetadata?.contentType ?? "application/octet-stream"
  const data = await body.blob()
  return {
    data: data.type === mimeType ? data : data.slice(0, data.size, mimeType),
    kind: "bytes",
    mimeType,
    name: params.fileName,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Document job failed."
}

function assertParams(
  params: Readonly<DocumentWorkflowParams>
): DocumentWorkflowParams {
  const validSource =
    params.source.kind === "url"
      ? Boolean(params.source.url)
      : Boolean(params.source.key)
  if (
    !params.jobId ||
    params.providers.length === 0 ||
    params.outputs.length === 0 ||
    !validSource
  ) {
    throw new Error("Invalid document workflow payload.")
  }
  return { ...params }
}
