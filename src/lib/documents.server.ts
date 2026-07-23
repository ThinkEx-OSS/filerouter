import { and, eq } from "drizzle-orm"
import {
  normalizeDocumentFileName,
  resolveDocumentMimeType,
} from "@file_router/sdk"
import type { HostedDocument } from "@file_router/sdk/hosted"

import { document } from "@/db/schema"
import { createDb } from "@/db/server"
import {
  MAX_HOSTED_UPLOAD_BYTES,
  MAX_HOSTED_UPLOAD_LABEL,
} from "@/lib/document-limits"
import { documentExpiresAt } from "@/lib/document-retention"
import {
  DocumentSourceError,
  storePublicDocument,
} from "@/lib/document-url.server"
import { HttpError, readContentLength } from "@/lib/http.server"
import { readPublicHttpUrl } from "@/lib/public-url"
import { putStream, StreamSizeLimitError } from "@/lib/r2-json.server"
import { hashToken } from "@/lib/tokens.server"

export type CreateDocumentSource =
  | { kind: "upload"; request: Request }
  | { kind: "url"; name?: string; url: string }

type PreparedDocumentSource =
  | {
      contentLength?: number
      contentType: string
      fileName: string
      kind: "upload"
      request: Request
    }
  | { fileName: string; kind: "url"; url: string }

interface StoredDocumentSource {
  contentType: string
  etag: string
  fileName: string
  size: number
}

export interface CreateDocumentResult {
  document: HostedDocument
  replayed: boolean
}

export async function createDocument(
  input: CreateDocumentSource,
  userId: string,
  env: Cloudflare.Env,
  idempotencyKey: string
): Promise<CreateDocumentResult> {
  const prepared = prepareDocumentSource(input)
  const idempotencyKeyHash = await hashToken(idempotencyKey)
  const db = createDb(env.DB)
  let requestHash: string | undefined
  if (prepared.kind === "url") {
    requestHash = await hashToken(
      JSON.stringify(urlDocumentFingerprint(prepared))
    )
    const replay = await replayDocument(
      userId,
      idempotencyKeyHash,
      requestHash,
      db
    )
    if (replay) {
      return replay
    }
  }

  const id = crypto.randomUUID()
  const objectKey = `documents/${id}/source`
  let keepObject = false

  try {
    const source = await storeDocumentSource(
      env.FILEROUTER_FILES,
      objectKey,
      prepared
    )
    const storedRequestHash =
      prepared.kind === "upload"
        ? await hashToken(
            JSON.stringify(uploadDocumentFingerprint(prepared, source))
          )
        : requestHash
    if (!storedRequestHash) {
      throw new Error("Document request hash was not created.")
    }
    if (prepared.kind === "upload") {
      const replay = await replayDocument(
        userId,
        idempotencyKeyHash,
        storedRequestHash,
        db
      )
      if (replay) {
        return replay
      }
    }

    const createdAt = new Date()
    const expiresAt = documentExpiresAt(createdAt)
    try {
      await db.insert(document).values({
        contentType: source.contentType,
        createdAt,
        etag: source.etag,
        expiresAt,
        fileName: source.fileName,
        id,
        idempotencyKeyHash,
        objectKey,
        requestHash: storedRequestHash,
        size: source.size,
        status: "ready",
        updatedAt: createdAt,
        userId,
      })
    } catch (error) {
      const raced = await replayDocument(
        userId,
        idempotencyKeyHash,
        storedRequestHash,
        db
      )
      if (raced) {
        return raced
      }
      throw error
    }

    keepObject = true
    return {
      document: serializeDocument({
        contentType: source.contentType,
        createdAt,
        etag: source.etag,
        expiresAt,
        fileName: source.fileName,
        id,
        size: source.size,
        status: "ready",
      }),
      replayed: false,
    }
  } finally {
    if (!keepObject) {
      await env.FILEROUTER_FILES.delete(objectKey).catch(() => undefined)
    }
  }
}

export async function getDocument(
  id: string,
  userId: string,
  env: Cloudflare.Env
): Promise<HostedDocument> {
  const stored = await createDb(env.DB)
    .select()
    .from(document)
    .where(and(eq(document.id, id), eq(document.userId, userId)))
    .get()
  if (!stored) {
    throw new HttpError(404, "Document not found.", {
      code: "document_not_found",
    })
  }
  return serializeDocument(stored)
}

async function storeUploadedDocument(
  bucket: R2Bucket,
  objectKey: string,
  source: Extract<PreparedDocumentSource, { kind: "upload" }>
): Promise<StoredDocumentSource> {
  const { request } = source
  if (!request.body) {
    throw new HttpError(400, "Document body is required.", {
      code: "document_body_required",
    })
  }
  const contentLength = source.contentLength
  if (contentLength !== undefined && contentLength > MAX_HOSTED_UPLOAD_BYTES) {
    throw uploadTooLarge()
  }
  let object: R2Object
  try {
    const metadata = {
      httpMetadata: { contentType: source.contentType },
      customMetadata: { fileName: source.fileName },
    }
    object =
      contentLength === undefined
        ? await putStream(bucket, objectKey, request.body, {
            ...metadata,
            maxBytes: MAX_HOSTED_UPLOAD_BYTES,
          })
        : await bucket.put(objectKey, request.body, metadata)
  } catch (error) {
    if (error instanceof StreamSizeLimitError) {
      throw uploadTooLarge()
    }
    throw error
  }
  if (object.size === 0) {
    throw new HttpError(400, "Document is empty.", { code: "empty_document" })
  }
  if (object.size > MAX_HOSTED_UPLOAD_BYTES) {
    await bucket.delete(objectKey)
    throw uploadTooLarge()
  }
  return {
    contentType: source.contentType,
    etag: object.etag,
    fileName: source.fileName,
    size: object.size,
  }
}

async function storeUrlDocument(
  bucket: R2Bucket,
  objectKey: string,
  source: Extract<PreparedDocumentSource, { kind: "url" }>
): Promise<StoredDocumentSource> {
  try {
    const stored = await storePublicDocument(
      bucket,
      objectKey,
      source.url,
      source.fileName
    )
    return { ...stored, fileName: source.fileName }
  } catch (error) {
    if (
      error instanceof StreamSizeLimitError ||
      (error instanceof DocumentSourceError && error.code === "too_large")
    ) {
      throw uploadTooLarge()
    }
    if (error instanceof DocumentSourceError && error.code === "empty") {
      throw new HttpError(400, "Document is empty.", {
        code: "empty_document",
      })
    }
    throw new HttpError(400, "Document URL could not be fetched.", {
      code: "document_fetch_failed",
    })
  }
}

async function replayDocument(
  userId: string,
  idempotencyKeyHash: string,
  requestHash: string,
  db: ReturnType<typeof createDb>
): Promise<CreateDocumentResult | undefined> {
  const existing = await db
    .select()
    .from(document)
    .where(
      and(
        eq(document.userId, userId),
        eq(document.idempotencyKeyHash, idempotencyKeyHash)
      )
    )
    .get()
  if (!existing) {
    return undefined
  }
  if (existing.requestHash !== requestHash) {
    throw new HttpError(
      409,
      "Idempotency key was already used for a different document.",
      { code: "idempotency_conflict" }
    )
  }
  return { document: serializeDocument(existing), replayed: true }
}

function serializeDocument(value: {
  contentType: string
  createdAt: Date
  etag: string
  expiresAt: Date
  fileName: string
  id: string
  size: number
  status: "expired" | "ready"
}): HostedDocument {
  return {
    contentType: value.contentType,
    createdAt: value.createdAt.toISOString(),
    etag: value.etag,
    expiresAt: value.expiresAt.toISOString(),
    id: value.id,
    name: value.fileName,
    size: value.size,
    status: value.status,
  }
}

function prepareDocumentSource(
  input: CreateDocumentSource
): PreparedDocumentSource {
  if (input.kind === "url") {
    let url: string
    try {
      url = readPublicHttpUrl(input.url).toString()
    } catch {
      throw new HttpError(400, "Document URL must be publicly reachable.", {
        code: "invalid_document_url",
      })
    }
    return {
      fileName: normalizeDocumentFileName(
        input.name ?? new URL(url).pathname.split("/").at(-1) ?? "document"
      ),
      kind: "url",
      url,
    }
  }

  const fileName = decodeFileName(
    input.request.headers.get("x-filerouter-filename") ?? "document"
  )
  return {
    contentLength: readContentLength(input.request.headers),
    contentType: resolveDocumentMimeType(
      fileName,
      input.request.headers.get("x-filerouter-content-type") ??
        input.request.headers.get("content-type") ??
        undefined
    ),
    fileName,
    kind: "upload",
    request: input.request,
  }
}

function urlDocumentFingerprint(
  source: Extract<PreparedDocumentSource, { kind: "url" }>
) {
  return { fileName: source.fileName, kind: source.kind, url: source.url }
}

function uploadDocumentFingerprint(
  source: Extract<PreparedDocumentSource, { kind: "upload" }>,
  stored: StoredDocumentSource
) {
  return {
    contentType: source.contentType,
    etag: stored.etag,
    fileName: source.fileName,
    kind: source.kind,
    size: stored.size,
  }
}

function storeDocumentSource(
  bucket: R2Bucket,
  objectKey: string,
  source: PreparedDocumentSource
): Promise<StoredDocumentSource> {
  return source.kind === "url"
    ? storeUrlDocument(bucket, objectKey, source)
    : storeUploadedDocument(bucket, objectKey, source)
}

function decodeFileName(value: string): string {
  try {
    return normalizeDocumentFileName(decodeURIComponent(value))
  } catch {
    throw new HttpError(400, "Invalid document filename.", {
      code: "invalid_document_filename",
    })
  }
}

function uploadTooLarge(): HttpError {
  return new HttpError(
    413,
    `Hosted uploads are limited to ${MAX_HOSTED_UPLOAD_LABEL}.`,
    { code: "upload_too_large" }
  )
}
