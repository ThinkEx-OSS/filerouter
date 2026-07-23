import { FileRouterError } from "./errors"
import { HOSTED_DOCUMENTS_PATH } from "./hosted"
import type { HostedDocument } from "./hosted"
import type { HostedTransport } from "./internal/hosted-transport"
import {
  isReadableStream,
  normalizeDocumentFileName,
  resolveDocumentMimeType,
  resolveParseInput,
} from "./internal/input"
import type { ParseInput } from "./types"

export interface HostedDocumentCreateOptions {
  fileName?: string
  idempotencyKey?: string
  mimeType?: string
  signal?: AbortSignal
}

export interface HostedDocumentGetOptions {
  signal?: AbortSignal
}

export interface FileRouterDocuments {
  create(
    input: ParseInput,
    options?: HostedDocumentCreateOptions
  ): Promise<HostedDocument>
  get(id: string, options?: HostedDocumentGetOptions): Promise<HostedDocument>
}

export class HostedDocuments implements FileRouterDocuments {
  readonly #transport: HostedTransport

  constructor(transport: HostedTransport) {
    this.#transport = transport
  }

  async create(
    input: ParseInput,
    options: HostedDocumentCreateOptions = {}
  ): Promise<HostedDocument> {
    const idempotencyKey = options.idempotencyKey ?? crypto.randomUUID()
    const headers = new Headers({ "Idempotency-Key": idempotencyKey })

    if (isHttpInput(input)) {
      headers.set("Content-Type", "application/json")
      return this.#transport.request<HostedDocument>(HOSTED_DOCUMENTS_PATH, {
        body: JSON.stringify({
          ...(options.fileName && { name: options.fileName }),
          url: httpInputUrl(input),
        }),
        headers,
        method: "POST",
        ...(options.signal && { signal: options.signal }),
      })
    }

    const body = await resolveUpload(input, options)
    headers.set("Content-Type", "application/octet-stream")
    headers.set("X-FileRouter-Content-Type", body.mimeType)
    headers.set("X-FileRouter-Filename", encodeURIComponent(body.fileName))
    return this.#transport.request<HostedDocument>(
      HOSTED_DOCUMENTS_PATH,
      {
        body: body.data,
        headers,
        method: "POST",
        ...(options.signal && { signal: options.signal }),
        ...(isReadableStream(body.data) && ({ duplex: "half" } as RequestInit)),
      },
      { retry: false }
    )
  }

  get(
    id: string,
    options: HostedDocumentGetOptions = {}
  ): Promise<HostedDocument> {
    return this.#transport.request<HostedDocument>(
      `${HOSTED_DOCUMENTS_PATH}/${encodeURIComponent(id)}`,
      options.signal ? { signal: options.signal } : {}
    )
  }
}

async function resolveUpload(
  input: ParseInput,
  options: HostedDocumentCreateOptions
): Promise<{
  data: Blob | ReadableStream<Uint8Array>
  fileName: string
  mimeType: string
}> {
  if (isReadableStream(input)) {
    const fileName = normalizeDocumentFileName(options.fileName)
    return {
      data: input,
      fileName,
      mimeType: resolveDocumentMimeType(fileName, options.mimeType),
    }
  }

  const resolved = await resolveParseInput(input, options.signal)
  if (resolved.kind !== "bytes") {
    throw new FileRouterError("Hosted document input must be bytes or a URL.", {
      code: "InvalidInput",
    })
  }
  const fileName = normalizeDocumentFileName(options.fileName ?? resolved.name)
  return {
    data: resolved.data,
    fileName,
    mimeType: resolveDocumentMimeType(
      fileName,
      options.mimeType ?? resolved.mimeType
    ),
  }
}

function isHttpInput(input: ParseInput): boolean {
  if (input instanceof URL) {
    return input.protocol === "http:" || input.protocol === "https:"
  }
  if (typeof input === "string") {
    return input.startsWith("http://") || input.startsWith("https://")
  }
  return (
    typeof input === "object" &&
    input !== null &&
    "kind" in input &&
    input.kind === "url"
  )
}

function httpInputUrl(input: ParseInput): string {
  if (input instanceof URL || typeof input === "string") {
    return input.toString()
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "kind" in input &&
    input.kind === "url"
  ) {
    return input.url.toString()
  }
  throw new FileRouterError("Hosted document URL is invalid.", {
    code: "InvalidInput",
  })
}
