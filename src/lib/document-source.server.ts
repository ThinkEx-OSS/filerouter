import { normalizeDocumentFileName } from "@file_router/sdk"

import { signHmac, verifyHmac } from "@/lib/hmac.server"
import { HttpError } from "@/lib/http.server"

const SOURCE_URL_TTL_SECONDS = 30 * 60
const SOURCE_TOKEN_PURPOSE = "filerouter-source-v2"

export async function createProviderSourceUrl(
  env: Cloudflare.Env,
  documentId: string,
  fileName: string
): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SOURCE_URL_TTL_SECONDS
  const normalizedName = normalizeDocumentFileName(fileName)
  const token = await signSourceToken(
    env.BETTER_AUTH_SECRET,
    documentId,
    normalizedName,
    expires
  )
  const baseUrl = new URL(env.BETTER_AUTH_URL)
  const url = new URL(
    `/api/v1/sources/${encodeURIComponent(documentId)}/${encodeURIComponent(normalizedName)}`,
    baseUrl.origin
  )
  url.searchParams.set("expires", String(expires))
  url.searchParams.set("token", token)
  return url.toString()
}

export async function getProviderSourceResponse(
  request: Request,
  env: Cloudflare.Env,
  documentId: string,
  fileName: string,
  expiresValue: string | undefined,
  token: string | undefined
): Promise<Response> {
  const expires = parseExpiration(expiresValue)
  const normalizedName = normalizeDocumentFileName(fileName)
  if (
    !token ||
    !expires ||
    !(await verifySourceToken(
      env.BETTER_AUTH_SECRET,
      documentId,
      normalizedName,
      expires,
      token
    ))
  ) {
    throw new HttpError(404, "Document source not found.", {
      code: "source_not_found",
    })
  }

  const key = `documents/${documentId}/source`
  let body: ReadableStream | null = null
  let object: R2Object | null
  let responseRange: { length: number; offset: number } | undefined
  let status = 200
  if (request.method === "HEAD") {
    object = await env.FILEROUTER_FILES.head(key)
  } else if (request.headers.has("range")) {
    const metadata = await env.FILEROUTER_FILES.head(key)
    if (!metadata || metadata.customMetadata?.fileName !== normalizedName) {
      throw new HttpError(404, "Document source not found.", {
        code: "source_not_found",
      })
    }
    const range = parseRange(request.headers.get("range"), metadata.size)
    if (!range) {
      return rangeNotSatisfiable(metadata.size)
    }
    const result = await env.FILEROUTER_FILES.get(key, { range })
    object = result
    body = result?.body ?? null
    responseRange = range
    status = 206
  } else {
    const result = await env.FILEROUTER_FILES.get(key)
    object = result
    body = result?.body ?? null
  }
  if (!object || object.customMetadata?.fileName !== normalizedName) {
    throw new HttpError(404, "Document source not found.", {
      code: "source_not_found",
    })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("Cache-Control", "private, no-store")
  headers.set("Accept-Ranges", "bytes")
  if (status === 206 && responseRange) {
    const { length, offset } = responseRange
    headers.set("Content-Length", String(length))
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`
    )
  } else {
    headers.set("Content-Length", String(object.size))
  }
  headers.set(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(normalizedName)}`
  )
  headers.set("ETag", object.httpEtag)

  return new Response(body, { headers, status })
}

function parseRange(
  value: string | null,
  size: number
): { length: number; offset: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value ?? "")
  if (!match || (!match[1] && !match[2]) || size === 0) {
    return undefined
  }
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) {
      return undefined
    }
    const length = Math.min(suffix, size)
    return { length, offset: size - length }
  }

  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return undefined
  }
  return { length: Math.min(end, size - 1) - start + 1, offset: start }
}

function rangeNotSatisfiable(size: number): Response {
  return new Response(null, {
    headers: {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Range": `bytes */${size}`,
    },
    status: 416,
  })
}

async function signSourceToken(
  secret: string,
  documentId: string,
  fileName: string,
  expires: number
): Promise<string> {
  return signHmac(
    secret,
    SOURCE_TOKEN_PURPOSE,
    sourceTokenPayload(documentId, fileName, expires)
  )
}

async function verifySourceToken(
  secret: string,
  documentId: string,
  fileName: string,
  expires: number,
  token: string
): Promise<boolean> {
  return verifyHmac(
    secret,
    SOURCE_TOKEN_PURPOSE,
    sourceTokenPayload(documentId, fileName, expires),
    token
  )
}

function sourceTokenPayload(
  documentId: string,
  fileName: string,
  expires: number
): string {
  return `${documentId}\n${fileName}\n${expires}`
}

function parseExpiration(value: string | undefined): number | undefined {
  if (!value || !/^\d{10}$/.test(value)) {
    return undefined
  }
  const expires = Number(value)
  return Number.isSafeInteger(expires) && expires >= Date.now() / 1000
    ? expires
    : undefined
}
