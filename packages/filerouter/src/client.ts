import { DEFAULT_PROVIDER_ID, providerIds } from "./catalog"
import type { ProviderId } from "./catalog"
import { HostedDocuments } from "./documents"
import type {
  FileRouterDocuments,
  HostedDocumentCreateOptions,
  HostedDocumentGetOptions,
} from "./documents"
import { FileRouterError } from "./errors"
import { HostedExecutions } from "./executions"
import type {
  FileRouterExecutions,
  HostedExecutionResultOptions,
} from "./executions"
import { FILEROUTER_DEFAULT_API_URL } from "./hosted"
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
  CompareResult,
  ParseInput,
  ParseOptions,
  ParseResult,
} from "./types"

export interface FileRouterOptions {
  apiKey?: string
  baseURL?: string
  fetch?: typeof globalThis.fetch
  pollingIntervalMs?: number
}

export interface HostedParseOptions extends Omit<ParseOptions, "provider"> {
  idempotencyKey?: string
  metadata?: Record<string, string>
  provider?: ProviderId
}

export interface HostedCompareOptions extends Omit<
  CompareOptions,
  "providers"
> {
  idempotencyKey?: string
  metadata?: Record<string, string>
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
  ): Promise<ParseResult> {
    assertPages(options.pages)
    const timeoutMs = options.timeoutMs ?? DEFAULT_HOSTED_JOB_TIMEOUT_MS
    const startedAt = Date.now()
    return withTimeout(timeoutMs, options.signal, async (signal) => {
      const provider = options.provider ?? DEFAULT_PROVIDER_ID
      const request = jobInput([provider], options)
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
      const execution = job.executions.find(
        (candidate) => candidate.provider === provider
      )
      if (!execution || execution.status !== "complete") {
        throw executionError(execution?.error?.message ?? job.error)
      }
      return this.executions.result(execution.id, { signal })
    })
  }

  async compare(
    input: ParseInput,
    options: HostedCompareOptions = {}
  ): Promise<CompareResult> {
    assertPages(options.pages)
    const timeoutMs = options.timeoutMs ?? DEFAULT_HOSTED_JOB_TIMEOUT_MS
    const startedAt = Date.now()
    return withTimeout(timeoutMs, options.signal, async (signal) => {
      const providers = uniqueProviders(options.providers ?? [...providerIds])
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
      const results = await Promise.all(
        job.executions.map(
          async (execution): Promise<CompareProviderResult> =>
            execution.status === "complete"
              ? {
                  durationMs: execution.durationMs ?? 0,
                  provider: execution.provider,
                  result: await this.executions.result(execution.id, {
                    signal,
                  }),
                  status: "parsed",
                }
              : {
                  durationMs: execution.durationMs ?? 0,
                  ...(execution.error && { error: execution.error }),
                  provider: execution.provider,
                  status:
                    execution.error?.code === "ProviderUnsupportedOutput"
                      ? "unsupported"
                      : "failed",
                }
        )
      )
      const completedAt = new Date().toISOString()
      return {
        input: describeInput(input),
        outputs: options.outputs ?? [DEFAULT_PARSE_OUTPUT],
        providers: results,
        timing: {
          completedAt,
          durationMs: Date.now() - startedAt,
          startedAt: new Date(startedAt).toISOString(),
        },
      }
    })
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
    providers: providers.map((provider) => ({
      ...(options.includeRaw !== undefined && {
        includeRaw: options.includeRaw,
      }),
      ...(options.pages && { pages: options.pages }),
      ...providerTargetOptions(options, provider),
      provider,
    })),
  }
  assertHostedJobDraft(input)
  return input
}

function providerTargetOptions(
  options: HostedParseOptions | HostedCompareOptions,
  provider: ProviderId
): { options?: Record<string, unknown> } {
  const value = options.providerOptions?.[provider]
  if (value === undefined) {
    return {}
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FileRouterError(
      `Provider options for ${provider} must be an object.`,
      { code: "InvalidInput" }
    )
  }
  return { options: value as Record<string, unknown> }
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
  HostedDocumentGetOptions,
  HostedExecutionResultOptions,
  HostedJobCreateInput,
  HostedJobCreateOptions,
  HostedJobGetOptions,
  HostedJobWaitOptions,
  HostedProviderListOptions,
}
