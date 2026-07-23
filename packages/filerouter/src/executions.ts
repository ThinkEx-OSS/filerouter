import { HOSTED_EXECUTIONS_PATH } from "./hosted"
import type { HostedTransport } from "./internal/hosted-transport"
import type { ParseResult } from "./types"

export interface HostedExecutionResultOptions {
  signal?: AbortSignal
}

export interface FileRouterExecutions {
  result(
    id: string,
    options?: HostedExecutionResultOptions
  ): Promise<ParseResult>
}

export class HostedExecutions implements FileRouterExecutions {
  readonly #transport: HostedTransport

  constructor(transport: HostedTransport) {
    this.#transport = transport
  }

  result(
    id: string,
    options: HostedExecutionResultOptions = {}
  ): Promise<ParseResult> {
    return this.#transport.request<ParseResult>(
      `${HOSTED_EXECUTIONS_PATH}/${encodeURIComponent(id)}/result`,
      options.signal ? { signal: options.signal } : {}
    )
  }
}
