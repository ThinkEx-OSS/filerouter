import {
  MAX_HOSTED_UPLOAD_BYTES,
  MAX_HOSTED_UPLOAD_LABEL,
} from "@/lib/document-limits"
import { readPublicHttpUrl } from "@/lib/public-url"

const MAX_REDIRECTS = 5

type WorkflowSource = {
  key: string
  url?: string
}

export async function materializeDocumentSource(
  bucket: R2Bucket,
  source: WorkflowSource,
  fileName: string
): Promise<void> {
  const existing = await bucket.head(source.key)
  if (existing) {
    assertSourceSize(existing.size)
    return
  }
  if (!source.url) {
    throw new Error("Uploaded document is unavailable.")
  }

  const response = await fetchPublicDocument(source.url)
  if (!response.body) {
    throw new Error("Document URL returned an empty response.")
  }
  const contentLength = readContentLength(response.headers)
  if (contentLength !== undefined) {
    assertSourceSize(contentLength)
  }

  const contentType =
    response.headers.get("content-type")?.split(";", 1)[0]?.trim() ||
    "application/octet-stream"
  const object = await bucket.put(
    source.key,
    limitStream(response.body, MAX_HOSTED_UPLOAD_BYTES),
    {
      httpMetadata: { contentType },
      customMetadata: { fileName },
    }
  )
  assertSourceSize(object.size)
}

async function fetchPublicDocument(value: string): Promise<Response> {
  let url = readPublicHttpUrl(value)
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/pdf,application/octet-stream,*/*;q=0.5",
        "User-Agent": "FileRouter/1.0 (+https://filerouter.dev)",
      },
      redirect: "manual",
    })
    if (!isRedirect(response.status)) {
      if (!response.ok) {
        throw new Error(`Document URL returned HTTP ${response.status}.`)
      }
      return response
    }
    const location = response.headers.get("location")
    if (!location || redirect === MAX_REDIRECTS) {
      throw new Error("Document URL redirected too many times.")
    }
    url = readPublicHttpUrl(new URL(location, url).toString())
  }
  throw new Error("Document URL redirected too many times.")
}

function readContentLength(headers: Headers): number | undefined {
  const value = headers.get("content-length")
  if (!value) {
    return undefined
  }
  const length = Number(value)
  return Number.isSafeInteger(length) && length >= 0 ? length : undefined
}

function limitStream(
  source: ReadableStream<Uint8Array>,
  maxBytes: number
): ReadableStream<Uint8Array> {
  let size = 0
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength
        if (size > maxBytes) {
          controller.error(
            new Error(
              `Hosted documents are limited to ${MAX_HOSTED_UPLOAD_LABEL}.`
            )
          )
          return
        }
        controller.enqueue(chunk)
      },
    })
  )
}

function assertSourceSize(size: number): void {
  if (size === 0) {
    throw new Error("Document is empty.")
  }
  if (size > MAX_HOSTED_UPLOAD_BYTES) {
    throw new Error(
      `Hosted documents are limited to ${MAX_HOSTED_UPLOAD_LABEL}.`
    )
  }
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status)
}
