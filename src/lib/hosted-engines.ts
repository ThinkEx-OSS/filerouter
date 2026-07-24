import {
  getCommercialProvider,
  type CommercialProviderId,
} from "@/lib/provider-display"

/** Compact logo box for the Hosted engine stack. */
export type EngineLogoSize = "mark" | "wordmark" | "wordmark-sm"

export const ENGINE_LOGO_CLASS: Record<EngineLogoSize, string> = {
  mark: "h-5 w-5",
  wordmark: "h-5 w-24",
  "wordmark-sm": "h-4 w-16",
}

export type HostedEngineRow =
  | {
      id: string
      label: string
      kind: "branded"
      logo: string
      darkLogo: string
      logoSize: EngineLogoSize
      /** Engine name shown next to a parent-brand mark (e.g. LiteParse). */
      caption?: string
    }
  | {
      id: string
      label: string
      kind: "text"
      muted?: boolean
    }

const ROW_HEIGHT_PX = 44 // h-11
const ROW_GAP_PX = 8 // gap-2

export function hostedEnginesStackMinHeightPx(count: number): number {
  if (count <= 0) return 0
  return count * ROW_HEIGHT_PX + (count - 1) * ROW_GAP_PX
}

function branded(
  id: CommercialProviderId,
  logoSize: EngineLogoSize
): HostedEngineRow {
  const provider = getCommercialProvider(id)
  return {
    id: provider.id,
    label: provider.label,
    kind: "branded",
    logo: provider.logo,
    darkLogo: provider.darkLogo,
    logoSize,
  }
}

/** Landing Hosted stack order (product display, not API catalog order). */
export const hostedEngineRows: ReadonlyArray<HostedEngineRow> = [
  branded("mistral-ocr", "wordmark-sm"),
  branded("datalab", "wordmark-sm"),
  branded("llamaparse", "wordmark"),
  {
    id: "liteparse",
    label: "LiteParse",
    kind: "branded",
    logo: "/providers/llamaindex.svg",
    darkLogo: "/providers/llamaindex-dark.svg",
    logoSize: "mark",
    caption: "LiteParse",
  },
  {
    id: "pdf-inspector",
    label: "PDF Inspector",
    kind: "branded",
    logo: "/providers/firecrawl.svg",
    darkLogo: "/providers/firecrawl-dark.svg",
    logoSize: "wordmark",
  },
  { id: "more", label: "More to come", kind: "text", muted: true },
]

export const hostedEnginesStackMinHeight = hostedEnginesStackMinHeightPx(
  hostedEngineRows.length
)
