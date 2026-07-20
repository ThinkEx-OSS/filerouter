import { normalizeDocumentFileName } from "@file_router/sdk"

import { HttpError } from "@/lib/http.server"

const SOURCE_URL_TTL_SECONDS = 30 * 60
const encoder = new TextEncoder()

export async function createProviderSourceUrl(
  env: Cloudflare.Env,
  jobId: string,
  fileName: string
): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SOURCE_URL_TTL_SECONDS
  const normalizedName = normalizeDocumentFileName(fileName)
  const token = await signSourceToken(
    env.BETTER_AUTH_SECRET,
    jobId,
    normalizedName,
    expires
  )
  const baseUrl = new URL(env.BETTER_AUTH_URL)
  const url = new URL(
    `/api/v1/sources/${encodeURIComponent(jobId)}/${encodeURIComponent(normalizedName)}`,
    baseUrl.origin
  )
  url.searchParams.set("expires", String(expires))
  url.searchParams.set("token", token)
  return url.toString()
}

export function canProvidersReachSourceUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase()
    return !(
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".local") ||
      isPrivateIpv4(hostname)
    )
  } catch {
    return false
  }
}

export async function getProviderSourceResponse(
  request: Request,
  env: Cloudflare.Env,
  jobId: string,
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
      jobId,
      normalizedName,
      expires,
      token
    ))
  ) {
    throw new HttpError(404, "Document source not found.", {
      code: "source_not_found",
    })
  }

  const key = `jobs/${jobId}/source`
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
  jobId: string,
  fileName: string,
  expires: number
): Promise<string> {
  const key = await sourceSigningKey(secret, ["sign"])
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    sourceTokenPayload(jobId, fileName, expires).buffer as ArrayBuffer
  )
  return toBase64Url(new Uint8Array(signature))
}

async function verifySourceToken(
  secret: string,
  jobId: string,
  fileName: string,
  expires: number,
  token: string
): Promise<boolean> {
  try {
    const key = await sourceSigningKey(secret, ["verify"])
    return crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(token).buffer as ArrayBuffer,
      sourceTokenPayload(jobId, fileName, expires).buffer as ArrayBuffer
    )
  } catch {
    return false
  }
}

function sourceSigningKey(
  secret: string,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`filerouter-source-v1:${secret}`),
    { hash: "SHA-256", name: "HMAC" },
    false,
    usages
  )
}

function sourceTokenPayload(
  jobId: string,
  fileName: string,
  expires: number
): Uint8Array {
  return encoder.encode(`${jobId}\n${fileName}\n${expires}`)
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

function toBase64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid source token.")
  }
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127
  )
}
