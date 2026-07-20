import { datalab } from "./datalab"
import { llamaparse } from "./llamaparse"
import { mistralOcr } from "./mistral"
import type { ProviderMap } from "./types"

export const providerIds = ["llamaparse", "mistral-ocr", "datalab"] as const

export type ProviderId = (typeof providerIds)[number]

export interface BuiltInProviderOptions {
  datalabApiKey?: string
  llamaCloudApiKey?: string
  mistralApiKey?: string
}

export function builtInProviders(
  options: BuiltInProviderOptions = {}
): Record<ProviderId, ProviderMap[string]> {
  return {
    datalab: datalab({
      ...(options.datalabApiKey && { apiKey: options.datalabApiKey }),
    }),
    llamaparse: llamaparse({
      ...(options.llamaCloudApiKey && { apiKey: options.llamaCloudApiKey }),
    }),
    "mistral-ocr": mistralOcr({
      ...(options.mistralApiKey && { apiKey: options.mistralApiKey }),
    }),
  }
}
