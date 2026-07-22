import { FileRouterError } from "../errors"
import { assertTimeoutMs } from "./provider-options"

export async function withTimeout<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  assertTimeoutMs(timeoutMs)

  const timeoutController = new AbortController()
  const timeoutError = new FileRouterError("FileRouter job timed out.", {
    code: "Timeout",
  })
  const timeout = setTimeout(
    () => timeoutController.abort(timeoutError),
    timeoutMs
  )
  if (timeoutMs === 0) {
    timeoutController.abort(timeoutError)
  }
  const operationSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal
  let rejectOnAbort: (() => void) | undefined

  try {
    operationSignal.throwIfAborted()
    const aborted = new Promise<never>((_, reject) => {
      rejectOnAbort = () => reject(operationSignal.reason)
      operationSignal.addEventListener("abort", rejectOnAbort, { once: true })
    })
    return await Promise.race([operation(operationSignal), aborted])
  } catch (error) {
    if (timeoutController.signal.aborted && !signal?.aborted) {
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
    if (rejectOnAbort) {
      operationSignal.removeEventListener("abort", rejectOnAbort)
    }
  }
}
