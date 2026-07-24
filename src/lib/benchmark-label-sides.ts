import type { MetricLabelSideConfig } from "@/lib/benchmark-label-placement"

/**
 * Hand-tuned label sides for landing scatter charts.
 * Prefer freezing this map over growing per-metric overrides forever.
 */
export const PARSEBENCH_LABEL_SIDE: MetricLabelSideConfig = {
  default: {
    "LlamaParse Agentic": "right",
    "LlamaParse Cost Effective": "left",
    "Datalab Accurate": "right",
    "Datalab Balanced": "left",
    "Datalab Fast": "right",
    "Mistral OCR 4 (Annotation)": "below",
    "Mistral OCR 4": "left",
  },
  metrics: {
    overall: { "Datalab Accurate": "above" },
    tables: { "LlamaParse Agentic": "above" },
    charts: { "Datalab Accurate": "below" },
    faithfulness: { "Datalab Accurate": "above" },
    formatting: {
      "Mistral OCR 4": "right",
      "Datalab Accurate": "above",
    },
    grounding: {
      "LlamaParse Cost Effective": "right",
      "Mistral OCR 4": "right",
    },
  },
}

export const LONG_EXTRACTION_LABEL_SIDE: MetricLabelSideConfig = {
  default: {
    "LlamaExtract Agentic": "left",
    "Datalab Extract Balanced": "left",
  },
}
