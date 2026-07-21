import { datalab } from "./datalab"
import { llamaparse } from "./llamaparse"
import { mistralOcr } from "./mistral"
import type { ProviderMap } from "./types"

export const providerIds = [
  "llamaparse",
  "mistral-ocr",
  "datalab",
  "liteparse",
  "pdf-inspector",
] as const

export type ProviderId = (typeof providerIds)[number]

export const DEFAULT_PROVIDER_ID = "llamaparse" satisfies ProviderId

export const localProviderIds = [
  "llamaparse",
  "mistral-ocr",
  "datalab",
] as const satisfies ReadonlyArray<ProviderId>

export type LocalProviderId = (typeof localProviderIds)[number]

export interface BuiltInProviderOptions {
  datalabApiKey?: string
  llamaCloudApiKey?: string
  mistralApiKey?: string
}

export function builtInProviders(
  options: BuiltInProviderOptions = {}
): Pick<ProviderMap, LocalProviderId> {
  return {
    llamaparse: llamaparse({
      ...(options.llamaCloudApiKey && { apiKey: options.llamaCloudApiKey }),
    }),
    "mistral-ocr": mistralOcr({
      ...(options.mistralApiKey && { apiKey: options.mistralApiKey }),
    }),
    datalab: datalab({
      ...(options.datalabApiKey && { apiKey: options.datalabApiKey }),
    }),
  }
}
