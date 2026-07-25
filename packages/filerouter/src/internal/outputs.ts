import type {
  ParseOutput,
  ParsePage,
  ParsePageField,
  ParseResult,
} from "../types"

export function selectOutputs(
  requested: Array<ParseOutput>,
  available: Partial<Record<ParseOutput, unknown>>
): ParseResult["outputs"] {
  return Object.fromEntries(
    requested.flatMap((output) => {
      const value = available[output]
      return value === undefined ? [] : [[output, value]]
    })
  ) as ParseResult["outputs"]
}

export function selectPageFields(
  result: ParseResult,
  requested: Array<ParsePageField> | undefined
): ParseResult {
  const pages = result.outputs.pages
  if (!requested || !pages) {
    return result
  }
  const fields = new Set(requested)
  return {
    ...result,
    outputs: {
      ...result.outputs,
      pages: pages.map((page) => selectPage(page, fields)),
    },
  }
}

function selectPage(
  page: ParsePage,
  fields: ReadonlySet<ParsePageField>
): ParsePage {
  const selected: ParsePage = {
    pageNumber: page.pageNumber,
    warnings: page.warnings,
  }
  for (const field of fields) {
    const value = page[field]
    if (value !== undefined) {
      Object.assign(selected, { [field]: value })
    }
  }
  return selected
}
