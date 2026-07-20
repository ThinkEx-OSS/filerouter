import { fileTypeFromBlob } from "file-type"

import {
  normalizeDocumentFileName,
  resolveDocumentMimeType,
  resolveParseInput,
} from "./internal/input"
import type { ParseInput } from "./types"

const GENERIC_MIME_TYPE = "application/octet-stream"

export interface DocumentInspection {
  detected?: {
    extension: string
    mimeType: string
  }
  extensionMimeType?: string
  kind: "bytes" | "url"
  /** True only when a specific resolved MIME type conflicts with the bytes. */
  mismatch: boolean
  name: string
  resolvedMimeType: string
  size?: number
}

/**
 * Inspects local bytes without sending them anywhere. URLs are classified by
 * their filename only and are never fetched implicitly.
 */
export async function inspectDocument(
  input: ParseInput
): Promise<DocumentInspection> {
  const resolved = await resolveParseInput(input)

  if (resolved.kind === "url") {
    const name = fileNameFromUrl(resolved.url)
    const extensionMimeType = resolveDocumentMimeType(name)
    return {
      ...(extensionMimeType !== GENERIC_MIME_TYPE && { extensionMimeType }),
      kind: "url",
      mismatch: false,
      name,
      resolvedMimeType: extensionMimeType,
    }
  }

  const extensionMimeType = resolveDocumentMimeType(resolved.name)
  const detected = await fileTypeFromBlob(resolved.data)
  const resolvedMimeType = resolved.mimeType

  return {
    ...(detected && {
      detected: { extension: detected.ext, mimeType: detected.mime },
    }),
    ...(extensionMimeType !== GENERIC_MIME_TYPE && { extensionMimeType }),
    kind: "bytes",
    mismatch: Boolean(
      detected &&
      resolvedMimeType !== GENERIC_MIME_TYPE &&
      detected.mime !== resolvedMimeType
    ),
    name: resolved.name,
    resolvedMimeType,
    size: resolved.data.size,
  }
}

function fileNameFromUrl(value: string): string {
  const segment = new URL(value).pathname.split("/").at(-1)
  if (!segment) {
    return "document"
  }
  try {
    return normalizeDocumentFileName(decodeURIComponent(segment))
  } catch {
    return normalizeDocumentFileName(segment)
  }
}
