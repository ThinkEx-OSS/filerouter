import type { DatalabParseOptions } from "./datalab"
import type { LlamaParseParseOptions } from "./llamaparse"
import type { MistralOcrParseOptions } from "./mistral"

export type LiteParseImageMode = "embed" | "off" | "placeholder"

export interface LiteParseParseOptions {
  convertOffice?: boolean
  imageMode?: LiteParseImageMode
  includeComplexity?: boolean
  ocr?: "auto" | "off"
  /** The hosted image currently includes English OCR data. */
  ocrLanguage?: "eng"
  raw?: {
    cropBox?: { bottom: number; left: number; right: number; top: number }
    dpi?: number
    emitWordBoxes?: boolean
    extractLinks?: boolean
    ocrFailureFatal?: boolean
    preserveVerySmallText?: boolean
    quiet?: boolean
    skipDiagonalText?: boolean
  }
  screenshots?: boolean
}

export type PdfInspectorParseOptions = Record<string, never>

export const parseOutputIds = [
  "chunks",
  "html",
  "images",
  "json",
  "markdown",
  "metadata",
  "pages",
  "tables",
  "text",
] as const

export type ParseOutput = (typeof parseOutputIds)[number]

export const DEFAULT_PARSE_OUTPUT = "markdown" satisfies ParseOutput

export type ParseInput =
  | string
  | URL
  | Blob
  | File
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream<Uint8Array>
  | {
      data: ArrayBuffer | ArrayBufferView | Blob
      kind: "bytes"
      mimeType?: string
      name?: string
    }
  | { kind: "file"; path: string }
  | {
      data: ReadableStream<Uint8Array>
      kind: "stream"
      mimeType?: string
      name: string
    }
  | { kind: "url"; url: string | URL }

/** Canonical, replayable input passed from FileRouter to provider adapters. */
export type ProviderInput =
  | { data: Blob; kind: "bytes"; mimeType: string; name: string }
  | { kind: "url"; url: string }

export interface ProviderOptionsById {
  datalab: DatalabParseOptions
  llamaparse: LlamaParseParseOptions
  liteparse: LiteParseParseOptions
  "mistral-ocr": MistralOcrParseOptions
  "pdf-inspector": PdfInspectorParseOptions
}

export interface ProviderParseOptions {
  datalab?: ProviderOptionsById["datalab"]
  llamaparse?: ProviderOptionsById["llamaparse"]
  liteparse?: ProviderOptionsById["liteparse"]
  "mistral-ocr"?: ProviderOptionsById["mistral-ocr"]
  "pdf-inspector"?: ProviderOptionsById["pdf-inspector"]
  [providerId: string]: unknown
}

export interface ParseOptions {
  /** Include the complete provider response. This may substantially increase result size. */
  includeRaw?: boolean
  outputs?: Array<ParseOutput>
  /** One-based document page numbers. Providers receive their native representation. */
  pages?: Array<number>
  provider?: string
  providerOptions?: ProviderParseOptions
  signal?: AbortSignal
  timeoutMs?: number
}

export interface CompareOptions extends Omit<ParseOptions, "provider"> {
  providers?: Array<string>
}

export interface ParseWarning {
  code: string
  message: string
  pageNumber?: number
}

export interface ParsedImage {
  bbox?: unknown
  caption?: string
  data?: string
  id?: string
  mimeType?: string
  name?: string
  pageNumber?: number
  url?: string
}

export interface ParsedTable {
  content?: string
  format?: string
  html?: string
  id?: string
  markdown?: string
  pageNumber?: number
  rows?: unknown
}

export interface ParsePage {
  blocks?: Array<unknown>
  confidence?: unknown
  dimensions?: { height?: number; width?: number }
  footer?: string
  header?: string
  html?: string
  images?: Array<ParsedImage>
  json?: unknown
  links?: Array<unknown>
  markdown?: string
  metadata?: Record<string, unknown>
  pageNumber: number
  tables?: Array<ParsedTable>
  text?: string
  warnings: Array<ParseWarning>
}

export interface ParseOutputValues {
  chunks: unknown
  html: string
  images: Array<ParsedImage>
  json: unknown
  markdown: string
  metadata: Record<string, unknown>
  pages: Array<ParsePage>
  tables: Array<ParsedTable>
  text: string
}

export interface ParseResult {
  id: string
  outputs: Partial<ParseOutputValues>
  pageCount: number
  provider: string
  quality?: {
    /** Provider-native score. Check scale before comparing providers. */
    score: number
    scale?: number
  }
  raw?: unknown
  timing: {
    completedAt: string
    durationMs: number
    startedAt: string
  }
  usage?: {
    costUsd?: number
    credits?: number
    pages?: number
  }
  warnings: Array<ParseWarning>
}

export interface CompareProviderResult {
  durationMs: number
  error?: {
    code?: string
    message: string
    requestId?: string
  }
  provider: string
  result?: ParseResult
  status: "failed" | "parsed" | "unsupported"
}

export interface CompareResult {
  input: string
  outputs: Array<ParseOutput>
  providers: Array<CompareProviderResult>
  timing: {
    completedAt: string
    durationMs: number
    startedAt: string
  }
}

export interface ProviderCapabilities {
  execution: "async" | "sync"
  features?: Array<
    | "blocks"
    | "cancel"
    | "confidence"
    | "classification"
    | "ocr"
    | "office-conversion"
    | "page-selection"
    | "screenshots"
    | "structured-extraction"
  >
  outputs: Array<ParseOutput>
}

export type ProviderJobState = Record<string, boolean | null | number | string>

export interface ProviderJobReference {
  id: string
  state?: ProviderJobState
  submittedAt: string
}

export type ProviderJobStatus =
  | { status: "pending" | "running" }
  | { error: string; status: "failed" }
  | { result: ParseResult; status: "complete" }

export interface ProviderJobs {
  get: (
    job: ProviderJobReference,
    options: ParseOptions
  ) => Promise<ProviderJobStatus>
  submit: (
    input: ProviderInput,
    options: ParseOptions
  ) => Promise<ProviderJobReference>
}

export interface FileRouterProvider<Raw = unknown> {
  readonly capabilities: ProviderCapabilities
  readonly id: string
  readonly jobs?: ProviderJobs
  readonly name: string
  readonly raw?: Raw
  parse: (input: ProviderInput, options: ParseOptions) => Promise<ParseResult>
}

export type ProviderMap = Record<string, FileRouterProvider>
