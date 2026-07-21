export type NativeParserId = "liteparse" | "pdf-inspector"

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
  pages?: Array<number>
  providerOptions?: unknown
}
