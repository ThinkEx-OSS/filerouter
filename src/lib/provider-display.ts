import type { ProviderId } from "@file_router/sdk/catalog"

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
] as const satisfies ReadonlyArray<{ id: ProviderId } & Record<string, string>>
