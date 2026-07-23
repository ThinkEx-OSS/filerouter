import { DEFAULT_PROVIDER_ID, providerIds } from "./catalog"
import type { ProviderId } from "./catalog"
import { HostedDocuments } from "./documents"
import type {
  FileRouterDocuments,
  HostedDocumentCreateOptions,
  HostedDocumentDeleteOptions,
  HostedDocumentGetOptions,
} from "./documents"
import { FileRouterError } from "./errors"
import { HostedExecutions } from "./executions"
import type {
  FileRouterExecutions,
  HostedExecutionResultOptions,
} from "./executions"
import { FILEROUTER_DEFAULT_API_URL } from "./hosted"
import type {
  HostedCompareResult,
  HostedJob,
  HostedParseResult,
  HostedProviderOptions,
  HostedProviderTarget,
} from "./hosted"
import { describeInput } from "./internal/input"
import { HostedTransport } from "./internal/hosted-transport"
import { readEnv, trimTrailingSlash } from "./internal/env"
import { assertPages } from "./internal/provider-options"
import { withTimeout } from "./internal/timeout"
import {
  assertHostedJobDraft,
  DEFAULT_HOSTED_JOB_TIMEOUT_MS,
  HostedJobs,
} from "./jobs"
import type {
  FileRouterJobs,
  HostedExecutionWaitOptions,
  HostedJobCreateDraft,
  HostedJobCreateInput,
  HostedJobCreateOptions,
  HostedJobGetOptions,
  HostedJobWaitOptions,
} from "./jobs"
import { HostedProviders } from "./providers"
import type {
  FileRouterProviders,
  HostedProviderListOptions,
} from "./providers"
import { DEFAULT_PARSE_OUTPUT } from "./types"
import type {
  CompareOptions,
  CompareProviderResult,
  ParseInput,
  ParseOptions,
} from "./types"

export interface FileRouterOptions {
  apiKey?: string
  baseURL?: string
  fetch?: typeof globalThis.fetch
  pollingIntervalMs?: number
}

export interface HostedParseOptions extends Omit<
  ParseOptions,
  "provider" | "providerOptions"
> {
  idempotencyKey?: string
  metadata?: Record<string, string>
  provider?: ProviderId
  providerOptions?: HostedProviderOptions
}

export interface HostedCompareOptions extends Omit<
  CompareOptions,
  "providerOptions" | "providers"
> {
  idempotencyKey?: string
  metadata?: Record<string, string>
  providerOptions?: HostedProviderOptions
  providers?: Array<ProviderId>
}

export class FileRouter {
  readonly documents: FileRouterDocuments
  readonly executions: FileRouterExecutions
  readonly jobs: FileRouterJobs
  readonly providers: FileRouterProviders

  constructor(options: FileRouterOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("FILEROUTER_API_KEY")
    if (!apiKey) {
      throw new FileRouterError("FileRouter requires FILEROUTER_API_KEY.", {
        code: "Auth",
      })
    }
    const transport = new HostedTransport({
      apiKey,
      baseURL: trimTrailingSlash(
        options.baseURL ??
          readEnv("FILEROUTER_API_URL") ??
          FILEROUTER_DEFAULT_API_URL
      ),
      ...(options.fetch && { fetch: options.fetch }),
    })
    this.documents = new HostedDocuments(transport)
    this.executions = new HostedExecutions(transport)
    this.jobs = new HostedJobs({
      transport,
      ...(options.pollingIntervalMs !== undefined && {
        pollingIntervalMs: options.pollingIntervalMs,
      }),
    })
    this.providers = new HostedProviders(transport)
  }

  async parse(
    input: ParseInput,
    options: HostedParseOptions = {}
  ): Promise<HostedParseResult> {
    const provider = options.provider ?? DEFAULT_PROVIDER_ID
    return this.#runHostedJob(
      input,
      [provider],
      options,
      async ({ documentId, job, signal }) => {
        const execution = job.executions.find(
          (candidate) => candidate.provider === provider
        )
        if (!execution || execution.status !== "complete") {
          throw executionError(execution?.error?.message ?? job.error)
        }
        const result = await this.executions.result(execution.id, { signal })
        return {
          ...result,
          resources: {
            documentId,
            executionId: execution.id,
            jobId: job.id,
          },
        }
      }
    )
  }

  async compare(
    input: ParseInput,
    options: HostedCompareOptions = {}
  ): Promise<HostedCompareResult> {
    const providers = uniqueProviders(options.providers ?? [...providerIds])
    return this.#runHostedJob(
      input,
      providers,
      options,
      async ({ documentId, job, signal, startedAt }) => {
        const results = await Promise.all(
          job.executions.map((execution) =>
            compareExecution(execution, this.executions, signal)
          )
        )
        const completedAt = new Date().toISOString()
        return {
          input: describeInput(input),
          outputs: options.outputs ?? [DEFAULT_PARSE_OUTPUT],
          providers: results,
          resources: {
            documentId,
            executions: job.executions.map(({ id, provider }) => ({
              id,
              provider,
            })),
            jobId: job.id,
          },
          timing: {
            completedAt,
            durationMs: Date.now() - startedAt,
            startedAt: new Date(startedAt).toISOString(),
          },
        }
      }
    )
  }

  #runHostedJob<Result>(
    input: ParseInput,
    providers: Array<ProviderId>,
    options: HostedParseOptions | HostedCompareOptions,
    complete: (run: HostedJobRun) => Promise<Result>
  ): Promise<Result> {
    assertPages(options.pages)
    const timeoutMs = options.timeoutMs ?? DEFAULT_HOSTED_JOB_TIMEOUT_MS
    const startedAt = Date.now()
    return withTimeout(timeoutMs, options.signal, async (signal) => {
      const request = jobInput(providers, options)
      const documentKey = documentIdempotencyKey(options.idempotencyKey)
      const document = await this.documents.create(input, {
        signal,
        ...(documentKey && { idempotencyKey: documentKey }),
      })
      const accepted = await this.jobs.create(
        { ...request, documentId: document.id },
        {
          signal,
          ...(options.idempotencyKey && {
            idempotencyKey: options.idempotencyKey,
          }),
        }
      )
      const job = await this.jobs.wait(accepted, {
        signal,
        timeoutMs: remainingTimeout(timeoutMs, startedAt),
      })
      return complete({
        documentId: document.id,
        job,
        signal,
        startedAt,
      })
    })
  }
}

interface HostedJobRun {
  documentId: string
  job: HostedJob
  signal: AbortSignal
  startedAt: number
}

async function compareExecution(
  execution: HostedJob["executions"][number],
  executions: FileRouterExecutions,
  signal: AbortSignal
): Promise<CompareProviderResult> {
  const durationMs = execution.durationMs ?? 0
  if (execution.status !== "complete") {
    return {
      durationMs,
      ...(execution.error && { error: execution.error }),
      provider: execution.provider,
      status:
        execution.error?.code === "ProviderUnsupportedOutput"
          ? "unsupported"
          : "failed",
    }
  }

  try {
    return {
      durationMs,
      provider: execution.provider,
      result: await executions.result(execution.id, { signal }),
      status: "parsed",
    }
  } catch (error) {
    if (signal.aborted) {
      throw error
    }
    return {
      durationMs,
      error: FileRouterError.isInstance(error)
        ? {
            code: error.code,
            message: error.message,
            ...(error.requestId && { requestId: error.requestId }),
          }
        : {
            message:
              error instanceof Error
                ? error.message
                : "Execution result could not be retrieved.",
          },
      provider: execution.provider,
      status: "failed",
    }
  }
}

function jobInput(
  providers: Array<ProviderId>,
  options: HostedParseOptions | HostedCompareOptions
): HostedJobCreateDraft {
  const outputs = options.outputs ?? [DEFAULT_PARSE_OUTPUT]
  const input: HostedJobCreateDraft = {
    ...(options.metadata && { metadata: options.metadata }),
    outputs,
    providers: providers.map((provider) => providerTarget(provider, options)),
  }
  assertHostedJobDraft(input)
  return input
}

function providerTarget(
  provider: ProviderId,
  options: HostedParseOptions | HostedCompareOptions
): HostedProviderTarget {
  const value = options.providerOptions?.[provider]
  if (
    value !== undefined &&
    (typeof value !== "object" || value === null || Array.isArray(value))
  ) {
    throw new FileRouterError(
      `Provider options for ${provider} must be an object.`,
      { code: "InvalidInput" }
    )
  }
  return {
    ...(options.includeRaw !== undefined && {
      includeRaw: options.includeRaw,
    }),
    ...(value !== undefined && { options: value }),
    ...(options.pages && { pages: options.pages }),
    provider,
  } as HostedProviderTarget
}

function uniqueProviders(providers: Array<ProviderId>): Array<ProviderId> {
  if (new Set(providers).size !== providers.length) {
    throw new FileRouterError("Each provider may appear only once.", {
      code: "InvalidInput",
    })
  }
  return providers
}

function documentIdempotencyKey(jobKey?: string): string | undefined {
  return jobKey ? `${jobKey}:document` : undefined
}

function remainingTimeout(timeoutMs: number, startedAt: number): number {
  return Math.max(0, timeoutMs - (Date.now() - startedAt))
}

function executionError(message?: string): FileRouterError {
  return new FileRouterError(message ?? "Document execution failed.", {
    code: "ParseFailed",
    providerId: "filerouter",
  })
}

export type {
  FileRouterDocuments,
  FileRouterExecutions,
  FileRouterJobs,
  FileRouterProviders,
  HostedDocumentCreateOptions,
  HostedDocumentDeleteOptions,
  HostedDocumentGetOptions,
  HostedExecutionResultOptions,
  HostedExecutionWaitOptions,
  HostedJobCreateInput,
  HostedJobCreateOptions,
  HostedJobGetOptions,
  HostedJobWaitOptions,
  HostedProviderListOptions,
}
