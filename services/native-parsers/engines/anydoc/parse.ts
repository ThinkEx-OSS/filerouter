import {
  formatFromBytes,
  formatFromExtension,
  toMarkdownBytes,
} from "@firecrawl/anydoc"

import type { NativeParserResult } from "../shared/contracts.ts"
import { ParserRequestError } from "../shared/http.ts"
import { readNativeParserOptions, readObject } from "../shared/options.ts"
import { selectNativeParserResult } from "../shared/selection.ts"

const EXTENSION_PATTERN = /\.([^.]+)$/

export async function parseAnydoc(
  bytes: Uint8Array,
  fileName: string,
  value: unknown,
  engineVersion: string
): Promise<NativeParserResult> {
  const options = readNativeParserOptions(value)
  if (options.pages) {
    throw new ParserRequestError(
      400,
      "unsupported_pages",
      "Anydoc does not support page selection."
    )
  }
  if (
    options.providerOptions !== undefined &&
    Object.keys(readObject(options.providerOptions)).length > 0
  ) {
    throw new ParserRequestError(
      400,
      "invalid_provider_options",
      "Anydoc does not accept provider options."
    )
  }

  const extension = EXTENSION_PATTERN.exec(fileName)?.[1]
  const format =
    formatFromBytes(bytes) ??
    (extension ? formatFromExtension(extension) : null)
  if (!format) {
    throw new ParserRequestError(
      400,
      "unsupported_document_type",
      "Anydoc does not support this document type."
    )
  }

  let markdown: string
  try {
    markdown = await toMarkdownBytes(bytes, format)
  } catch {
    throw new ParserRequestError(
      400,
      "parse_failed",
      "Anydoc could not parse the document."
    )
  }

  return selectNativeParserResult(
    {
      engine: { id: "anydoc", version: engineVersion },
      markdown,
      metadata: {
        format,
        paginated: false,
      },
      pageCount: 0,
      pages: [],
      warnings: [],
    },
    options
  )
}
