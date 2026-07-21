import { FileRouterError } from "./errors"
import { FILEROUTER_DEFAULT_API_URL } from "./hosted"
import { readEnv, trimTrailingSlash } from "./internal/env"
import { withTimeout } from "./internal/timeout"
import { DEFAULT_HOSTED_JOB_TIMEOUT_MS, HostedJobs } from "./jobs"
import type {
  FileRouterJobs,
  HostedCompareJobOptions,
  HostedCompareOptions,
  HostedParseJobOptions,
  HostedParseOptions,
} from "./jobs"
import type { CompareResult, ParseInput, ParseResult } from "./types"

export interface FileRouterClientOptions {
  apiKey?: string
  baseURL?: string
  fetch?: typeof globalThis.fetch
  pollingIntervalMs?: number
}

export class FileRouterClient {
  readonly jobs: FileRouterJobs

  constructor(options: FileRouterClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("FILEROUTER_API_KEY")
    if (!apiKey) {
      throw new FileRouterError("FileRouter requires FILEROUTER_API_KEY.", {
        code: "Auth",
      })
    }

    this.jobs = new HostedJobs({
      apiKey,
      baseURL: trimTrailingSlash(
        options.baseURL ??
          readEnv("FILEROUTER_API_URL") ??
          FILEROUTER_DEFAULT_API_URL
      ),
      ...(options.fetch && { fetch: options.fetch }),
      ...(options.pollingIntervalMs !== undefined && {
        pollingIntervalMs: options.pollingIntervalMs,
      }),
    })
  }

  async parse(
    input: ParseInput,
    options: HostedParseOptions = {}
  ): Promise<ParseResult> {
    const { timeoutMs = DEFAULT_HOSTED_JOB_TIMEOUT_MS, ...jobOptions } = options
    const startedAt = Date.now()

    const job = await withTimeout(timeoutMs, options.signal, (signal) =>
      this.jobs.create(input, {
        ...jobOptions,
        operation: "parse",
        signal,
      } satisfies HostedParseJobOptions)
    )
    return this.jobs.wait(job, {
      timeoutMs: remainingTimeout(timeoutMs, startedAt),
      ...(options.signal && { signal: options.signal }),
    })
  }

  async compare(
    input: ParseInput,
    options: HostedCompareOptions = {}
  ): Promise<CompareResult> {
    const { timeoutMs = DEFAULT_HOSTED_JOB_TIMEOUT_MS, ...jobOptions } = options
    const startedAt = Date.now()

    const job = await withTimeout(timeoutMs, options.signal, (signal) =>
      this.jobs.create(input, {
        ...jobOptions,
        operation: "compare",
        signal,
      } satisfies HostedCompareJobOptions)
    )
    return this.jobs.wait(job, {
      timeoutMs: remainingTimeout(timeoutMs, startedAt),
      ...(options.signal && { signal: options.signal }),
    })
  }
}

function remainingTimeout(timeoutMs: number, startedAt: number): number {
  return Math.max(0, timeoutMs - (Date.now() - startedAt))
}

export type {
  FileRouterJobs,
  HostedCompareJobOptions,
  HostedCompareOptions,
  HostedJobGetOptions,
  HostedJobWaitOptions,
  HostedParseJobOptions,
  HostedParseOptions,
} from "./jobs"
