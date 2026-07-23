import type { ProviderId } from "@file_router/sdk/catalog"

export type ProviderDisplay = {
  darkLogo: string
  id: ProviderId
  label: string
  logo: string
}

export const availableProviders = [
  {
    darkLogo: "/providers/llamaparse-dark.svg",
    id: "llamaparse",
    label: "LlamaParse",
    logo: "/providers/llamaparse.svg",
  },
  {
    darkLogo: "/providers/datalab-dark.svg",
    id: "datalab",
    label: "Datalab",
    logo: "/providers/datalab.svg",
  },
  {
    darkLogo: "/providers/mistral-dark.png",
    id: "mistral-ocr",
    label: "Mistral OCR",
    logo: "/providers/mistral.png",
  },
] as const satisfies ReadonlyArray<ProviderDisplay>

const providerById = Object.fromEntries(
  availableProviders.map((provider) => [provider.id, provider])
) as Record<(typeof availableProviders)[number]["id"], ProviderDisplay>

/** Map public benchmark row names to FileRouter adapters we actually ship. */
export function resolveSupportedBenchmarkProvider(
  entryName: string
): ProviderDisplay | null {
  const name = entryName.trim().toLowerCase()

  if (name.startsWith("llamaparse")) return providerById.llamaparse
  if (name.startsWith("datalab")) return providerById.datalab
  if (name.startsWith("mistral ocr") || name.startsWith("mistral-ocr")) {
    return providerById["mistral-ocr"]
  }

  return null
}
