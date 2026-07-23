import { FileRouterError } from "./errors"
import {
  HOSTED_JOBS_PATH,
  MAX_HOSTED_JOB_REQUEST_BYTES,
  MAX_HOSTED_METADATA_ENTRIES,
} from "./hosted"
import type {
  HostedExecution,
  HostedJob,
  HostedJobAccepted,
  HostedProviderTarget,
} from "./hosted"
import type { ProviderId } from "./catalog"
import type { HostedTransport } from "./internal/hosted-transport"
import { abortableSleep } from "./internal/sleep"
import { withTimeout } from "./internal/timeout"
import type { ParseOutput } from "./types"

export const DEFAULT_HOSTED_JOB_TIMEOUT_MS = 10 * 60 * 1000

export interface HostedJobCreateInput {
  documentId: string
  metadata?: Record<string, string>
  outputs: Array<ParseOutput>
  providers: Array<HostedProviderTarget>
}

export type HostedJobCreateDraft = Omit<HostedJobCreateInput, "documentId">

export interface HostedJobCreateOptions {
  idempotencyKey?: string
  signal?: AbortSignal
}

export interface HostedJobGetOptions {
  signal?: AbortSignal
}

export interface HostedJobWaitOptions extends HostedJobGetOptions {
  onStatus?: (job: HostedJob) => void
  timeoutMs?: number
}

export interface HostedExecutionWaitOptions extends HostedJobGetOptions {
  onStatus?: (execution: HostedExecution) => void
  timeoutMs?: number
}

export interface FileRouterJobs {
  create(
    input: HostedJobCreateInput,
    options?: HostedJobCreateOptions
  ): Promise<HostedJobAccepted>
  get(id: string, options?: HostedJobGetOptions): Promise<HostedJob>
  wait(
    job: HostedJobAccepted | string,
    options?: HostedJobWaitOptions
  ): Promise<HostedJob>
  waitForExecution(
    job: HostedJobAccepted | string,
    provider: ProviderId,
    options?: HostedExecutionWaitOptions
  ): Promise<HostedExecution>
}

interface HostedJobsOptions {
  pollingIntervalMs?: number
  transport: HostedTransport
}

export class HostedJobs implements FileRouterJobs {
  readonly #pollingIntervalMs: number
  readonly #transport: HostedTransport

  constructor(options: HostedJobsOptions) {
    this.#pollingIntervalMs = options.pollingIntervalMs ?? 1000
    this.#transport = options.transport
  }

  async create(
    input: HostedJobCreateInput,
    options: HostedJobCreateOptions = {}
  ): Promise<HostedJobAccepted> {
    const headers = new Headers({
      "Content-Type": "application/json",
      "Idempotency-Key": options.idempotencyKey ?? crypto.randomUUID(),
    })
    return this.#transport.request<HostedJobAccepted>(HOSTED_JOBS_PATH, {
      body: serializeJobInput(input),
      headers,
      method: "POST",
      ...(options.signal && { signal: options.signal }),
    })
  }

  get(id: string, options: HostedJobGetOptions = {}): Promise<HostedJob> {
    return this.#transport.request<HostedJob>(
      `${HOSTED_JOBS_PATH}/${encodeURIComponent(id)}`,
      options.signal ? { signal: options.signal } : {}
    )
  }

  wait(
    job: HostedJobAccepted | string,
    options: HostedJobWaitOptions = {}
  ): Promise<HostedJob> {
    return withTimeout(
      options.timeoutMs ?? DEFAULT_HOSTED_JOB_TIMEOUT_MS,
      options.signal,
      (signal) => this.#wait(jobId(job), signal, options.onStatus)
    )
  }

  waitForExecution(
    job: HostedJobAccepted | string,
    provider: ProviderId,
    options: HostedExecutionWaitOptions = {}
  ): Promise<HostedExecution> {
    return withTimeout(
      options.timeoutMs ?? DEFAULT_HOSTED_JOB_TIMEOUT_MS,
      options.signal,
      (signal) =>
        this.#waitForExecution(jobId(job), provider, signal, options.onStatus)
    )
  }

  async #wait(
    id: string,
    signal: AbortSignal,
    onStatus?: (job: HostedJob) => void
  ): Promise<HostedJob> {
    let previousStatus: HostedJob["status"] | undefined
    for await (const job of this.#pollJobs(id, signal)) {
      if (job.status !== previousStatus) {
        onStatus?.(job)
        previousStatus = job.status
      }
      if (job.status === "complete" || job.status === "failed") {
        return job
      }
    }
    throw new FileRouterError("Hosted job polling ended unexpectedly.", {
      code: "Unknown",
    })
  }

  async #waitForExecution(
    id: string,
    provider: ProviderId,
    signal: AbortSignal,
    onStatus?: (execution: HostedExecution) => void
  ): Promise<HostedExecution> {
    let previousStatus: HostedExecution["status"] | undefined
    for await (const job of this.#pollJobs(id, signal)) {
      const execution = job.executions.find(
        (candidate) => candidate.provider === provider
      )
      if (!execution) {
        if (job.status === "complete" || job.status === "failed") {
          throw new FileRouterError(
            `Hosted job ${id} does not include provider ${provider}.`,
            { code: "InvalidInput" }
          )
        }
        continue
      }
      if (execution.status !== previousStatus) {
        onStatus?.(execution)
        previousStatus = execution.status
      }
      if (execution.status === "complete" || execution.status === "failed") {
        return execution
      }
      if (job.status === "complete" || job.status === "failed") {
        throw new FileRouterError(
          `Hosted job ${id} ended before ${provider} reached a terminal status.`,
          { code: "ParseFailed", providerId: provider }
        )
      }
    }
    throw new FileRouterError("Hosted execution polling ended unexpectedly.", {
      code: "Unknown",
    })
  }

  async *#pollJobs(id: string, signal: AbortSignal): AsyncGenerator<HostedJob> {
    while (true) {
      yield await this.get(id, { signal })
      await abortableSleep(this.#pollingIntervalMs, signal)
    }
  }
}

function jobId(job: HostedJobAccepted | string): string {
  return typeof job === "string" ? job : job.id
}

export function assertHostedJobDraft(input: HostedJobCreateDraft): void {
  serializeJobInput({
    ...input,
    documentId: "00000000-0000-4000-8000-000000000000",
  })
}

function serializeJobInput(input: HostedJobCreateInput): string {
  if (input.outputs.length === 0) {
    throw new FileRouterError("Hosted jobs require at least one output.", {
      code: "InvalidInput",
    })
  }
  if (input.providers.length === 0) {
    throw new FileRouterError("Hosted jobs require at least one provider.", {
      code: "InvalidInput",
    })
  }
  if (
    new Set(input.providers.map((target) => target.provider)).size !==
    input.providers.length
  ) {
    throw new FileRouterError("Each provider may appear only once.", {
      code: "InvalidInput",
    })
  }
  if (
    input.metadata &&
    Object.keys(input.metadata).length > MAX_HOSTED_METADATA_ENTRIES
  ) {
    throw new FileRouterError(
      `Hosted jobs allow at most ${MAX_HOSTED_METADATA_ENTRIES} metadata entries.`,
      { code: "InvalidInput" }
    )
  }
  return stringifyJson(input)
}

function stringifyJson(value: unknown): string {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch (cause) {
    throw new FileRouterError("Hosted job could not be serialized as JSON.", {
      cause,
      code: "InvalidInput",
    })
  }
  if (serialized === undefined) {
    throw new FileRouterError("Hosted job could not be serialized as JSON.", {
      code: "InvalidInput",
    })
  }
  if (
    new TextEncoder().encode(serialized).byteLength >
    MAX_HOSTED_JOB_REQUEST_BYTES
  ) {
    throw new FileRouterError(
      `Hosted job requests are limited to ${MAX_HOSTED_JOB_REQUEST_BYTES / 1024} KiB.`,
      { code: "InvalidInput" }
    )
  }
  return serialized
}
