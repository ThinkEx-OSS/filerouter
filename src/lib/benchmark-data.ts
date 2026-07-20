export type BenchmarkMetricId =
  | "overall"
  | "tables"
  | "charts"
  | "faithfulness"
  | "formatting"
  | "grounding"
  | "coverage"
  | "recall"
  | "precision"
  | "leafAccuracy"
  | "readingOrder"
  | "headings"

export type BenchmarkEntry = {
  name: string
  category?: string
  scores: Partial<Record<BenchmarkMetricId, number | null>>
  secondary: string | null
  featured?: boolean
}

export type BenchmarkMetric = {
  id: BenchmarkMetricId
  label: string
  technicalLabel: string
  description: string
  maximum: number
  decimals: number
  suffix: string
}

export type BenchmarkDefinition = {
  id: "parsebench" | "long-extraction" | "local"
  tabLabel: string
  tabHint: string
  title: string
  description: string
  sourceName: string
  sourceUrl: string
  snapshotLabel: string
  methodologyNote: string
  defaultMetric: BenchmarkMetricId
  metrics: ReadonlyArray<BenchmarkMetric>
  entries: ReadonlyArray<BenchmarkEntry>
}

const parseBenchSnapshot = `
LlamaParse Cost Effective|LlamaParse|76.77|81.42|70.15|90.92|68.78|72.59|0.375¢ / page|0
LlamaParse Agentic|LlamaParse|84.88|90.74|78.11|89.68|85.24|80.62|1.25¢ / page|1
OpenAI GPT-5 Mini (Reasoning Minimal)|VLM - Proprietary|46.83|69.82|30.13|82.30|45.77|6.15|0.88¢ / page|0
OpenAI GPT-5 Mini (Reasoning Medium)|VLM - Proprietary|51.52|74.60|38.96|85.68|45.35|13.03|3.05¢ / page|0
Anthropic Haiku 4.5 (Disable Thinking)|VLM - Proprietary|45.17|77.21|13.77|78.74|49.39|6.72|1.64¢ / page|0
Anthropic Haiku 4.5 (Thinking)|VLM - Proprietary|53.12|78.70|27.39|84.83|62.36|12.30|3.69¢ / page|0
Google Gemini 3 Flash (Thinking Minimal)|VLM - Proprietary|71.04|89.85|64.83|86.19|58.35|55.97|0.65¢ / page|0
Google Gemini 3 Flash (Thinking High)|VLM - Proprietary|75.05|91.50|64.79|90.87|68.31|59.77|2.41¢ / page|0
Google Gemini 3.5 Flash (Thinking Medium)|VLM - Proprietary|69.92|91.12|44.01|90.19|59.14|65.14|4.28¢ / page|0
Google Gemini 3.5 Flash (Thinking Minimal)|VLM - Proprietary|63.09|86.24|18.74|88.22|68.09|54.18|1.82¢ / page|0
Anthropic Opus 4.6|VLM - Proprietary|54.07|86.52|13.49|89.70|64.19|16.47|5.78¢ / page|0
Anthropic Opus 4.7|VLM - Proprietary|63.34|87.17|55.84|90.26|69.42|13.99|7.14¢ / page|0
Anthropic Opus 4.8|VLM - Proprietary|63.70|89.65|49.75|89.02|71.38|18.69|7.30¢ / page|0
Anthropic Fable 5|VLM - Proprietary|70.78|89.79|52.21|90.02|72.62|49.24|15.60¢ / page|0
Anthropic Sonnet 5|VLM - Proprietary|62.13|86.65|60.53|86.51|64.93|12.03|3.18¢ / page|0
Google Gemini 3.1 Pro|VLM - Proprietary|69.14|91.00|41.13|90.16|52.43|70.99|8.49¢ / page|0
Google Gemini 3.1 Flash Lite|VLM - Proprietary|58.32|85.48|9.92|89.46|58.38|48.38|0.29¢ / page|0
OpenAI GPT-5.4 (Reasoning None)|VLM - Proprietary|62.23|83.89|65.22|85.57|59.52|16.95|2.90¢ / page|0
OpenAI GPT-5.5 (Reasoning Medium)|VLM - Proprietary|67.76|90.05|65.53|86.81|60.12|36.28|13.09¢ / page|0
OpenAI GPT-5.5 (Reasoning None)|VLM - Proprietary|64.39|89.31|59.11|87.17|64.46|21.90|5.93¢ / page|0
OpenAI GPT-5.6 Terra (Reasoning None)|VLM - Proprietary|64.17|86.23|63.75|82.56|59.96|28.35|2.95¢ / page|0
OpenAI GPT-5.6 Sol (Reasoning None)|VLM - Proprietary|62.12|89.34|59.57|86.17|50.42|25.09|5.87¢ / page|0
OpenAI GPT-5.6 Luna (Reasoning None)|VLM - Proprietary|56.32|81.30|28.32|82.65|63.90|25.43|1.09¢ / page|0
OpenAI GPT-5.4 Nano|VLM - Proprietary|43.35|60.16|17.57|78.05|54.56|6.41|0.25¢ / page|0
AWS Textract|Commercial - IDP|47.88|84.58|5.97|74.76|3.71|70.36|1.5¢ / page|0
Google Cloud Document AI|Commercial - IDP|50.39|55.10|1.44|83.65|50.51|61.26|1¢ / page|0
Azure Document Intelligence (Layout)|Commercial - IDP|59.64|86.00|1.56|84.93|51.93|73.78|1¢ / page|0
Reducto (Agentic)|Commercial - Startup APIs|72.97|80.42|73.4|86.37|57.6|67.07|4.76¢ / page|0
Pulse Ultra 2|Commercial - Startup APIs|77.08|75.45|90.82|79.49|73.05|66.56|15¢ / page|0
Datalab Accurate|Commercial - Startup APIs|69.95|90.29|62.40|83.87|40.79|72.38|1¢ / page|1
Datalab Balanced|Commercial - Startup APIs|69.51|89.10|62.05|83.63|39.74|73.05|0.4¢ / page|0
Datalab Fast|Commercial - Startup APIs|67.79|85.08|57.56|82.76|39.06|74.47|0.4¢ / page|0
Reducto|Commercial - Startup APIs|67.83|70.33|56.99|86.37|56.75|68.71|2.38¢ / page|0
Pulse|Commercial - Startup APIs|65.59|82.01|39.62|82.76|51.99|71.56|1.5¢ / page|0
Extend|Commercial - Startup APIs|55.75|85.05|1.59|84.08|47.36|60.67|2.5¢ / page|0
Extend (2.0)|Commercial - Startup APIs|66.99|85.93|39.14|82.11|56.92|70.85|2.5¢ / page|0
LandingAI|Commercial - Startup APIs|45.23|73.72|10.88|88.60|27.87|25.08|3¢ / page|0
Firecrawl|Commercial - Startup APIs|31.08|55.88|0|74.37|25.16|0|0.9¢ / page|0
Mistral OCR 4 (Annotation)|Commercial - IDP|68.23|73.94|40.11|89.55|66.37|71.17|0.5¢ / page|1
Mistral OCR 4|Commercial - IDP|60.68|73.94|2.35|89.55|66.37|71.17|0.4¢ / page|0
Databricks AI Parse|Commercial - IDP|60.68|83.67|0|88.25|55.25|76.23|6.06¢ / page|0
Databricks AI Parse (batch)|Commercial - IDP|60.68|83.93|0|88.3|55.04|76.14|0.2¢ / page|0
Infinity-Parser2-Pro|VLM - Open Weight|74.28|86.4|61.3|89.7|59.1|74.9||0
Infinity-Parser2-Flash|VLM - Open Weight|73.25|82.88|55.56|89.52|57.7|80.61||0
Qwen3-VL-8B-Instruct|VLM - Open Weight|61.97|74.61|28.18|87.63|64.23|55.18||0
Dots.mocr|VLM - Open Weight|55.79|85.15|0.95|90.03|46.99|55.81||0
Falcon-OCR|VLM - Open Weight|53.08|74.70|0.82|78.59|47.91|63.37||0
Docling-models|VLM - Open Weight|50.65|66.41|52.76|66.93|1.03|66.11||0
Chandra-ocr-2|VLM - Open Weight|70.1|89.2|65.1|83.7|61.4|51.2||0
PaddleOCR-VL-1.6|VLM - Open Weight|67.43|67.77|54.24|82.71|54.64|77.8||0
PaddleOCR-VL-1.5|VLM - Open Weight|65.95|67.38|47.62|82.72|54.27|77.78||0
Surya OCR 2|VLM - Open Weight|64.83|82.68|21.95|86.57|61.36|71.59||0
Gemma-4-31B-it|VLM - Open Weight|62.4|80.6|15|89.9|69.3|57.4||0
Gemma-4-26B-A4B-it|VLM - Open Weight|58.5|70|14.2|83.8|65.1|59.2||0
LightOnOCR-2-1B|VLM - Open Weight|48|75.5|13.5|87.8|63.2|0||0
Qianfan-OCR|VLM - Open Weight|46.2|72.3|0.9|83.5|53.8|20.6||0
MinerU2.5-Pro-2605-1.2B|VLM - Open Weight|72.78|77.59|61.64|87.88|57.49|79.30||0
Unlimited-OCR|VLM - Open Weight|46.17|70.21|1.34|86.81|0.97|71.52||0
MinerU2.5-2509-1.2B|VLM - Open Weight|45.9|71.7|1.1|80.8|4.5|71.5||0
Qwen3.6-35B-A3B|VLM - Open Weight|44.1|19.1|5.1|90.7|58.3|47.4||0
DeepSeek-OCR-2|VLM - Open Weight|41.2|61.7|1.1|82|54|7||0
PaddleOCR-VL|VLM - Open Weight|40.9|67.1|0.9|82.7|54|0||0
Gemma-4-E4B-it|VLM - Open Weight|40.5|25|7.7|81.4|52.5|35.8||0
Granite Vision 4.1 4B|VLM - Open Weight|39.45|63.81|47.47|64.43|21.52|0||0
Qwen3.5-4B|VLM - Open Weight|35.4|8|2.5|88.9|57.8|19.7||0
Qwen3.5-9B|VLM - Open Weight|31.9|9.9|5.4|90.5|22|31.8||0
Qwen3.5-0.8B|VLM - Open Weight|28.4|1.5|0.4|82|43.1|15||0
Qwen3.5-2B|VLM - Open Weight|27.3|0|0.1|87.2|31.1|18.3||0
GLM-OCR|VLM - Open Weight|29.6|66.1|1.7|78|2.3|0||0
KDL-Frontier-Parser-nano|VLM - Open Weight|76.36|85.56|63.41|87.19|66.81|78.84||0
MarkItDown|Open Source - Local|18.63|15.77|2.02|64.54|0.91|9.90||0
OpenDataLoader|Open Source - Local|29.40|35.18|0.92|66.06|34.07|10.77||0
PyMuPDF4LLM|Open Source - Local|30.88|36.68|1.58|60.85|44.63|10.68||0
PyMuPDF (Text)|Open Source - Local|16.02|0.00|0.00|68.28|0.95|10.86||0
PyMuPDF (HTML)|Open Source - Local|16.62|0.00|0.00|55.63|18.26|9.20||0
pypdf|Open Source - Local|14.87|0.00|0.00|62.50|0.91|10.92||0
pdf-inspector|Open Source - Local|26.59|26.64|5.29|56.06|35.07|9.91||0
LiteParse (no OCR)|Open Source - Local|32.8|40.3|3.4|68.6|44.6|10.7||0
Warp Ingest|Open Source - Local|40.18|57.45|7.04|70.81|45.81|19.78||0
`

function parseScore(value: string): number | null {
  return value ? Number(value) : null
}

const parseBenchEntries: ReadonlyArray<BenchmarkEntry> = parseBenchSnapshot
  .trim()
  .split("\n")
  .map((row) => {
    const [
      name = "",
      category = "",
      overall = "",
      tables = "",
      charts = "",
      faithfulness = "",
      formatting = "",
      grounding = "",
      secondary = "",
      featured = "",
    ] = row.split("|")

    return {
      name,
      category,
      scores: {
        overall: parseScore(overall),
        tables: parseScore(tables),
        charts: parseScore(charts),
        faithfulness: parseScore(faithfulness),
        formatting: parseScore(formatting),
        grounding: parseScore(grounding),
      },
      secondary: secondary || null,
      featured: featured === "1",
    }
  })

const longExtractionEntries = [
  {
    name: "Reducto Deep Extract",
    category: "Document extraction API",
    scores: {
      coverage: 100,
      precision: 99.6,
      recall: 99.6,
      leafAccuracy: 99.3,
    },
    secondary: "p50 306s",
  },
  {
    name: "Extend MAX",
    category: "Document extraction API",
    scores: {
      coverage: 93.3,
      precision: 86.4,
      recall: 92.7,
      leafAccuracy: 92.8,
    },
    secondary: "p50 276s",
  },
  {
    name: "LlamaExtract Agentic",
    category: "Document extraction API",
    scores: {
      coverage: 90.2,
      precision: 80,
      recall: 77.5,
      leafAccuracy: 88.9,
    },
    secondary: "p50 270s",
  },
  {
    name: "GPT-5.5",
    category: "Frontier model",
    scores: {
      coverage: 88,
      precision: 95.8,
      recall: 52.7,
      leafAccuracy: 96.2,
    },
    secondary: "p50 314s",
  },
  {
    name: "Datalab Extract Balanced",
    category: "Document extraction API",
    scores: {
      coverage: 73.8,
      precision: 92.8,
      recall: 33.8,
      leafAccuracy: 90.9,
    },
    secondary: "p50 1,110s",
  },
  {
    name: "Claude Opus 4.8",
    category: "Frontier model",
    scores: {
      coverage: 51.6,
      precision: 92,
      recall: 70.7,
      leafAccuracy: 91.7,
    },
    secondary: "p50 366s",
  },
  {
    name: "Gemini 3.1 Pro",
    category: "Frontier model",
    scores: {
      coverage: 49.8,
      precision: 95.8,
      recall: 48.6,
      leafAccuracy: 96.2,
    },
    secondary: "p50 187s",
  },
] satisfies ReadonlyArray<BenchmarkEntry>

const localEntries = [
  {
    name: "pdf-inspector",
    category: "Local · no OCR",
    scores: {
      overall: 0.875,
      readingOrder: 0.915,
      tables: 0.814,
      headings: 0.788,
    },
    secondary: "2.8s / 200 docs",
  },
  {
    name: "LiteParse",
    category: "Local · no OCR",
    scores: {
      overall: 0.87,
      readingOrder: 0.908,
      tables: 0.693,
      headings: 0.811,
    },
    secondary: "13.9s / 200 docs",
  },
  {
    name: "OpenDataLoader",
    category: "Local · no OCR",
    scores: {
      overall: 0.843,
      readingOrder: 0.912,
      tables: 0.489,
      headings: 0.76,
    },
    secondary: "9.8s / 200 docs",
  },
  {
    name: "PyMuPDF4LLM",
    category: "Local · no OCR",
    scores: {
      overall: 0.735,
      readingOrder: 0.886,
      tables: 0.401,
      headings: 0.424,
    },
    secondary: "15.5s / 200 docs",
  },
  {
    name: "MarkItDown",
    category: "Local · no OCR",
    scores: {
      overall: 0.583,
      readingOrder: 0.879,
      tables: 0,
      headings: 0,
    },
    secondary: "6.7s / 200 docs",
  },
] satisfies ReadonlyArray<BenchmarkEntry>

export const benchmarks = [
  {
    id: "parsebench",
    tabLabel: "Agent-ready",
    tabHint: "Enterprise PDFs",
    title: "Can an agent use the result?",
    description:
      "Human-verified enterprise documents scored for the structure and meaning AI agents need to act reliably.",
    sourceName: "ParseBench",
    sourceUrl: "https://github.com/run-llama/ParseBench",
    snapshotLabel: "Latest public leaderboard · accessed July 20, 2026",
    methodologyNote:
      "2,078 pages across insurance, finance, and government documents. Scores are 0–100; higher is better.",
    defaultMetric: "overall",
    metrics: [
      {
        id: "overall",
        label: "Overall",
        technicalLabel: "Overall",
        description:
          "Average performance across the five benchmark dimensions.",
        maximum: 100,
        decimals: 2,
        suffix: "",
      },
      {
        id: "tables",
        label: "Tables",
        technicalLabel: "GTRM",
        description: "Table structure and cell-content preservation.",
        maximum: 100,
        decimals: 2,
        suffix: "",
      },
      {
        id: "charts",
        label: "Charts",
        technicalLabel: "ChartDataPointMatch",
        description: "Recovery of values and relationships encoded in charts.",
        maximum: 100,
        decimals: 2,
        suffix: "",
      },
      {
        id: "faithfulness",
        label: "Faithfulness",
        technicalLabel: "Content Faithfulness",
        description: "Whether parsed text preserves the source content.",
        maximum: 100,
        decimals: 2,
        suffix: "",
      },
      {
        id: "formatting",
        label: "Formatting",
        technicalLabel: "Semantic Formatting",
        description:
          "Preservation of headings, lists, emphasis, and meaning-bearing structure.",
        maximum: 100,
        decimals: 2,
        suffix: "",
      },
      {
        id: "grounding",
        label: "Layout",
        technicalLabel: "Element Pass Rate",
        description:
          "Whether extracted elements remain grounded to the correct page regions.",
        maximum: 100,
        decimals: 2,
        suffix: "",
      },
    ],
    entries: parseBenchEntries,
  },
  {
    id: "long-extraction",
    tabLabel: "Long documents",
    tabHint: "Dense extraction",
    title: "Can it finish the whole document?",
    description:
      "A stress test of production extraction systems on long, table-heavy documents with tens of thousands of values.",
    sourceName: "LongExtractionBench",
    sourceUrl: "https://www.micro1.ai/benchmark/long-extraction",
    snapshotLabel: "Published July 2026",
    methodologyNote:
      "225 documents averaging 358 pages. Accuracy is measured on completed documents, so read it alongside coverage.",
    defaultMetric: "coverage",
    metrics: [
      {
        id: "coverage",
        label: "Coverage",
        technicalLabel: "Completed / 225",
        description:
          "The share of documents the system completed successfully.",
        maximum: 100,
        decimals: 1,
        suffix: "%",
      },
      {
        id: "recall",
        label: "Completeness",
        technicalLabel: "Row recall",
        description:
          "The share of ground-truth rows correctly returned on completed documents.",
        maximum: 100,
        decimals: 1,
        suffix: "%",
      },
      {
        id: "precision",
        label: "Precision",
        technicalLabel: "Row precision",
        description:
          "The share of returned rows that matched real ground-truth rows.",
        maximum: 100,
        decimals: 1,
        suffix: "%",
      },
      {
        id: "leafAccuracy",
        label: "Field accuracy",
        technicalLabel: "Leaf accuracy",
        description: "Cell-level correctness after a returned row is matched.",
        maximum: 100,
        decimals: 1,
        suffix: "%",
      },
    ],
    entries: longExtractionEntries,
  },
  {
    id: "local",
    tabLabel: "Fast and local",
    tabHint: "Native-text PDFs",
    title: "How far can a local parser go?",
    description:
      "Lightweight engines running without OCR or model-based parsing, compared on document structure and speed.",
    sourceName: "pdf-inspector published run",
    sourceUrl: "https://github.com/firecrawl/pdf-inspector#benchmark",
    snapshotLabel: "Refreshed July 16, 2026",
    methodologyNote:
      "200-PDF OpenDataLoader corpus on an Apple M4 Pro. Scores are 0–1; speed is the median of three corpus runs.",
    defaultMetric: "overall",
    metrics: [
      {
        id: "overall",
        label: "Overall",
        technicalLabel: "Composite",
        description: "Combined reading-order, table, and heading performance.",
        maximum: 1,
        decimals: 3,
        suffix: "",
      },
      {
        id: "readingOrder",
        label: "Reading order",
        technicalLabel: "NID",
        description:
          "Similarity between extracted and ground-truth reading sequence.",
        maximum: 1,
        decimals: 3,
        suffix: "",
      },
      {
        id: "tables",
        label: "Tables",
        technicalLabel: "TEDS",
        description: "Table structure and cell-text similarity.",
        maximum: 1,
        decimals: 3,
        suffix: "",
      },
      {
        id: "headings",
        label: "Headings",
        technicalLabel: "MHS",
        description: "Preservation of heading hierarchy.",
        maximum: 1,
        decimals: 3,
        suffix: "",
      },
    ],
    entries: localEntries,
  },
] as const satisfies ReadonlyArray<BenchmarkDefinition>
