import {
  MAX_HOSTED_UPLOAD_BYTES,
  MAX_HOSTED_UPLOAD_LABEL,
} from "@/lib/document-limits"
import { readContentLength } from "@/lib/http.server"
import { readPublicHttpUrl } from "@/lib/public-url"
import { putStream } from "@/lib/r2-json.server"

const MAX_REDIRECTS = 5

export interface StoredPublicDocument {
  contentType: string
  etag: string
  size: number
}

export class DocumentSourceError extends Error {
  constructor(
    readonly code: "empty" | "too_large",
    message: string
  ) {
    super(message)
    this.name = "DocumentSourceError"
  }
}

export async function storePublicDocument(
  bucket: R2Bucket,
  key: string,
  sourceUrl: string,
  fileName: string
): Promise<StoredPublicDocument> {
  const response = await fetchPublicDocument(sourceUrl)
  if (!response.body) {
    throw new DocumentSourceError(
      "empty",
      "Document URL returned an empty response."
    )
  }
  const contentLength = readContentLength(response.headers)
  if (contentLength !== undefined) {
    assertSourceSize(contentLength)
  }

  const contentType =
    response.headers.get("content-type")?.split(";", 1)[0]?.trim() ||
    "application/octet-stream"
  const metadata = {
    httpMetadata: { contentType },
    customMetadata: { fileName },
  }
  const object =
    contentLength === undefined
      ? await putStream(bucket, key, response.body, {
          ...metadata,
          maxBytes: MAX_HOSTED_UPLOAD_BYTES,
        })
      : await bucket.put(key, response.body, metadata)
  try {
    assertSourceSize(object.size)
  } catch (error) {
    await bucket.delete(key)
    throw error
  }
  return {
    contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
    etag: object.etag,
    size: object.size,
  }
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

function assertSourceSize(size: number): void {
  if (size === 0) {
    throw new DocumentSourceError("empty", "Document is empty.")
  }
  if (size > MAX_HOSTED_UPLOAD_BYTES) {
    throw new DocumentSourceError(
      "too_large",
      `Hosted documents are limited to ${MAX_HOSTED_UPLOAD_LABEL}.`
    )
  }
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status)
}
