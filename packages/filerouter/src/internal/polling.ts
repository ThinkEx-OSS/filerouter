import { FileRouterError } from "../errors"
import { abortableSleep } from "./sleep"
import type {
  ParseOptions,
  ParseResult,
  ProviderJobReference,
  ProviderJobs,
} from "../types"

export async function waitForProviderJob(
  providerId: string,
  jobs: ProviderJobs,
  job: ProviderJobReference,
  options: ParseOptions,
  pollingIntervalMs = 1000
): Promise<ParseResult> {
  const deadline = Date.now() + (options.timeoutMs ?? 5 * 60 * 1000)

  while (Date.now() < deadline) {
    const status = await jobs.get(job, options)
    if (status.status === "complete") {
      return status.result
    }
    if (status.status === "failed") {
      throw new FileRouterError(status.error, {
        code: "ParseFailed",
        providerId,
      })
    }
    await abortableSleep(pollingIntervalMs, options.signal)
  }

  throw new FileRouterError(`${providerId} job timed out.`, {
    code: "Timeout",
    providerId,
  })
}
