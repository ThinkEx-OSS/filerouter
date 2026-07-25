export type NativeParserId = "liteparse" | "pdf-inspector"

export const nativeParserOutputIds = [
  "images",
  "markdown",
  "metadata",
  "pages",
  "text",
] as const

export type NativeParserOutput = (typeof nativeParserOutputIds)[number]

export const nativeParserPageFieldIds = [
  "dimensions",
  "markdown",
  "metadata",
  "text",
] as const

export type NativeParserPageField = (typeof nativeParserPageFieldIds)[number]

export type NativeParserWarning = {
  code: string
  message: string
  pageNumber?: number
}

export type NativeParserPage = {
  dimensions?: { height: number; width: number }
  markdown?: string
  metadata?: Record<string, unknown>
  pageNumber: number
  text?: string
}

export type NativeParserImage = {
  data: string
  id: string
  mimeType: string
  pageNumber: number
}

export type NativeParserResult = {
  engine: {
    id: NativeParserId
    version: string
  }
  images?: Array<NativeParserImage>
  markdown?: string
  metadata: Record<string, unknown>
  pageCount: number
  pages: Array<NativeParserPage>
  text?: string
  warnings: Array<NativeParserWarning>
}

export type NativeParserOptions = {
  outputs?: Array<NativeParserOutput>
  pageFields?: Array<NativeParserPageField>
  pages?: Array<number>
  providerOptions?: unknown
}
