import type {
  NativeParserOptions,
  NativeParserPage,
  NativeParserPageField,
  NativeParserResult,
} from "./contracts.ts"

export function selectNativeParserResult(
  result: NativeParserResult,
  options: NativeParserOptions
): NativeParserResult {
  if (!options.outputs && !options.pageFields) {
    return result
  }
  const outputs = new Set(options.outputs)
  return {
    engine: result.engine,
    ...(outputs.has("images") && result.images
      ? { images: result.images }
      : {}),
    ...(outputs.has("markdown") && result.markdown !== undefined
      ? { markdown: result.markdown }
      : {}),
    metadata: result.metadata,
    pageCount: result.pageCount,
    pages: outputs.has("pages")
      ? result.pages.map((page) => selectPage(page, options.pageFields))
      : [],
    ...(outputs.has("text") && result.text !== undefined
      ? { text: result.text }
      : {}),
    warnings: result.warnings,
  }
}

function selectPage(
  page: NativeParserPage,
  requested: Array<NativeParserPageField> | undefined
): NativeParserPage {
  if (!requested) {
    return page
  }
  const selected: NativeParserPage = { pageNumber: page.pageNumber }
  for (const field of requested) {
    const value = page[field]
    if (value !== undefined) {
      Object.assign(selected, { [field]: value })
    }
  }
  return selected
}
