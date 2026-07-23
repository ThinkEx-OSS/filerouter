import { FileRouterError } from "../errors"
import type { ParseInput, ProviderInput } from "../types"

const DEFAULT_FILE_NAME = "document"
const DEFAULT_MIME_TYPE = "application/octet-stream"

const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  avif: "image/avif",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  epub: "application/epub+zip",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  htm: "text/html",
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  md: "text/markdown",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odt: "application/vnd.oasis.opendocument.text",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rtf: "application/rtf",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsm: "application/vnd.ms-excel.sheet.macroenabled.12",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xltx: "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
}

export async function resolveParseInput(
  input: ParseInput,
  signal?: AbortSignal
): Promise<ProviderInput> {
  signal?.throwIfAborted()

  if (typeof input === "string") {
    return isHttpUrl(input)
      ? { kind: "url", url: input }
      : resolveFilePath(input)
  }

  if (input instanceof URL) {
    return resolveUrl(input)
  }

  if (isKindInput(input)) {
    switch (input.kind) {
      case "url":
        return resolveUrl(new URL(input.url))
      case "file":
        return resolveFilePath(input.path)
      case "stream": {
        const name = normalizeDocumentFileName(input.name)
        return {
          data: normalizeBlob(
            await readStreamAsBlob(input.data, signal),
            name,
            input.mimeType
          ),
          kind: "bytes",
          mimeType: resolveDocumentMimeType(name, input.mimeType),
          name,
        }
      }
      case "bytes": {
        const name = normalizeDocumentFileName(input.name)
        const suppliedType =
          input.mimeType ??
          (input.data instanceof Blob ? input.data.type : undefined)
        return {
          data: normalizeBlob(input.data, name, suppliedType),
          kind: "bytes",
          mimeType: resolveDocumentMimeType(name, suppliedType),
          name,
        }
      }
    }
  }

  if (typeof File !== "undefined" && input instanceof File) {
    const name = normalizeDocumentFileName(input.name)
    return {
      data: normalizeBlob(input, name, input.type),
      kind: "bytes",
      mimeType: resolveDocumentMimeType(name, input.type),
      name,
    }
  }

  if (input instanceof Blob) {
    return {
      data: normalizeBlob(input, DEFAULT_FILE_NAME, input.type),
      kind: "bytes",
      mimeType: resolveDocumentMimeType(DEFAULT_FILE_NAME, input.type),
      name: DEFAULT_FILE_NAME,
    }
  }

  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    return {
      data: normalizeBlob(input, DEFAULT_FILE_NAME),
      kind: "bytes",
      mimeType: DEFAULT_MIME_TYPE,
      name: DEFAULT_FILE_NAME,
    }
  }

  if (isReadableStream(input)) {
    return {
      data: normalizeBlob(
        await readStreamAsBlob(input, signal),
        DEFAULT_FILE_NAME
      ),
      kind: "bytes",
      mimeType: DEFAULT_MIME_TYPE,
      name: DEFAULT_FILE_NAME,
    }
  }

  throw new FileRouterError("Unsupported document input.", {
    code: "InvalidInput",
  })
}

async function readStreamAsBlob(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): Promise<Blob> {
  const reader = stream.getReader()
  const chunks: Array<BlobPart> = []
  const onAbort = () => {
    void reader.cancel(signal?.reason).catch(() => undefined)
  }
  signal?.addEventListener("abort", onAbort, { once: true })

  try {
    while (true) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) {
        return new Blob(chunks)
      }
      const chunk = new Uint8Array(value.byteLength)
      chunk.set(value)
      chunks.push(chunk)
    }
  } finally {
    signal?.removeEventListener("abort", onAbort)
    reader.releaseLock()
  }
}

export function describeInput(input: ParseInput): string {
  if (typeof input === "string") {
    return input
  }
  if (input instanceof URL) {
    return input.toString()
  }
  if (typeof File !== "undefined" && input instanceof File) {
    return input.name
  }
  if (input instanceof Blob) {
    return `blob:${input.size}`
  }
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    return "bytes"
  }
  if (isKindInput(input)) {
    switch (input.kind) {
      case "bytes":
        return input.name ?? "bytes"
      case "file":
        return input.path
      case "stream":
        return input.name
      case "url":
        return input.url.toString()
    }
  }
  return "stream"
}

export function normalizeDocumentFileName(value?: string): string {
  const name = value?.split(/[\\/]/).at(-1)?.trim() || DEFAULT_FILE_NAME
  if (name.length > 255 || hasControlCharacters(name)) {
    throw new FileRouterError("Invalid document filename.", {
      code: "InvalidInput",
    })
  }
  return name
}

export function resolveDocumentMimeType(
  name: string,
  suppliedType?: string
): string {
  const normalizedType = normalizeMimeType(suppliedType)
  if (normalizedType && normalizedType !== DEFAULT_MIME_TYPE) {
    return normalizedType
  }

  const extension = name.toLowerCase().split(".").at(-1)
  return (
    MIME_TYPES_BY_EXTENSION[extension ?? ""] ??
    normalizedType ??
    DEFAULT_MIME_TYPE
  )
}

function resolveUrl(url: URL): ProviderInput {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FileRouterError(`Unsupported URL protocol: ${url.protocol}`, {
      code: "InvalidInput",
    })
  }

  return { kind: "url", url: url.toString() }
}

async function resolveFilePath(path: string): Promise<ProviderInput> {
  try {
    const { openAsBlob } = await import("node:fs")
    const name = normalizeDocumentFileName(path)
    const mimeType = resolveDocumentMimeType(name)
    return {
      data: assertNonEmptyBlob(await openAsBlob(path, { type: mimeType })),
      kind: "bytes",
      mimeType,
      name,
    }
  } catch (error) {
    if (error instanceof FileRouterError) {
      throw error
    }
    throw new FileRouterError(`Unable to read document: ${path}`, {
      cause: error,
      code: "InvalidInput",
    })
  }
}

function normalizeBlob(
  input: ArrayBuffer | ArrayBufferView | Blob,
  name: string,
  suppliedType?: string
): Blob {
  const mimeType = resolveDocumentMimeType(name, suppliedType)
  if (input instanceof Blob) {
    return assertNonEmptyBlob(
      input.type === mimeType ? input : input.slice(0, input.size, mimeType)
    )
  }

  const bytes =
    input instanceof ArrayBuffer
      ? input
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice()
  return assertNonEmptyBlob(new Blob([bytes], { type: mimeType }))
}

function assertNonEmptyBlob(blob: Blob): Blob {
  if (blob.size === 0) {
    throw new FileRouterError("Document is empty.", { code: "InvalidInput" })
  }
  return blob
}

function normalizeMimeType(value?: string): string | undefined {
  const mimeType = value?.split(";", 1)[0]?.trim().toLowerCase()
  return mimeType && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)
    ? mimeType
    : undefined
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function isKindInput(
  input: unknown
): input is Extract<ParseInput, { kind: string }> {
  return input !== null && typeof input === "object" && "kind" in input
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}

export function isReadableStream(
  input: unknown
): input is ReadableStream<Uint8Array> {
  return (
    typeof ReadableStream !== "undefined" && input instanceof ReadableStream
  )
}

export function isStreamInput(
  input: unknown
): input is Extract<ParseInput, { kind: "stream" }> {
  return (
    typeof input === "object" &&
    input !== null &&
    "kind" in input &&
    input.kind === "stream"
  )
}
