import { FileRouterError } from "./errors"
import { HOSTED_JOBS_PATH, MAX_HOSTED_JOB_REQUEST_BYTES } from "./hosted"
import type {
  HostedJob,
  HostedJobAccepted,
  HostedProviderTarget,
} from "./hosted"
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
      (signal) =>
        this.#wait(
          typeof job === "string" ? job : job.id,
          signal,
          options.onStatus
        )
    )
  }

  async #wait(
    id: string,
    signal: AbortSignal,
    onStatus?: (job: HostedJob) => void
  ): Promise<HostedJob> {
    let previousStatus: HostedJob["status"] | undefined
    while (true) {
      const job = await this.get(id, { signal })
      if (job.status !== previousStatus) {
        onStatus?.(job)
        previousStatus = job.status
      }
      if (job.status === "complete" || job.status === "failed") {
        return job
      }
      await abortableSleep(this.#pollingIntervalMs, signal)
    }
  }
}

export function assertHostedJobDraft(input: HostedJobCreateDraft): void {
  serializeJobInput({
    ...input,
    documentId: "00000000-0000-4000-8000-000000000000",
  })
}

function serializeJobInput(input: HostedJobCreateInput): string {
  if (
    new Set(input.providers.map((target) => target.provider)).size !==
    input.providers.length
  ) {
    throw new FileRouterError("Each provider may appear only once.", {
      code: "InvalidInput",
    })
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
