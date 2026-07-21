import { FileRouterError } from "../errors"
import { assertTimeoutMs } from "./provider-options"

export async function withTimeout<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  assertTimeoutMs(timeoutMs)

  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs)
  if (timeoutMs === 0) {
    timeoutController.abort()
  }
  const operationSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal

  try {
    operationSignal.throwIfAborted()
    return await operation(operationSignal)
  } catch (error) {
    if (timeoutController.signal.aborted && !signal?.aborted) {
      throw new FileRouterError("FileRouter job timed out.", {
        code: "Timeout",
      })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
