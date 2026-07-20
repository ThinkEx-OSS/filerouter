import type { ParseOutput, ParseResult } from "../types"

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
