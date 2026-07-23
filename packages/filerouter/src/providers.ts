import { HOSTED_PROVIDERS_PATH } from "./hosted"
import type { HostedProvider } from "./hosted"
import type { HostedTransport } from "./internal/hosted-transport"

export interface HostedProviderListOptions {
  signal?: AbortSignal
}

export interface FileRouterProviders {
  list(options?: HostedProviderListOptions): Promise<Array<HostedProvider>>
}

export class HostedProviders implements FileRouterProviders {
  readonly #transport: HostedTransport

  constructor(transport: HostedTransport) {
    this.#transport = transport
  }

  async list(
    options: HostedProviderListOptions = {}
  ): Promise<Array<HostedProvider>> {
    const response = await this.#transport.request<{
      data: Array<HostedProvider>
    }>(HOSTED_PROVIDERS_PATH, options.signal ? { signal: options.signal } : {})
    return response.data
  }
}
