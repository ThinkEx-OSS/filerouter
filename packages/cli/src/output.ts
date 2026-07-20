import { parseOutputIds } from "@file_router/sdk"
import type { CompareResult, ParseOutput, ParseResult } from "@file_router/sdk"

export function formatParseResult(
  result: ParseResult,
  outputs: Array<ParseOutput>,
  json: boolean
): string {
  if (json) {
    return prettyJson(result)
  }

  const preferred = outputs[0] ?? "markdown"
  switch (preferred) {
    case "markdown":
      return prettyText(result.outputs.markdown)
    case "text":
      return prettyText(result.outputs.text)
    case "html":
      return prettyText(result.outputs.html)
    default:
      return prettyJson(result.outputs[preferred] ?? result)
  }
}

function prettyText(value: unknown): string {
  return typeof value === "string" ? value : prettyJson(value)
}

export function formatCompareResult(
  result: CompareResult,
  json: boolean
): string {
  if (json) {
    return prettyJson(result)
  }

  const rows = result.providers.map((provider) => {
    const detail = provider.error?.message ?? `${provider.durationMs}ms`
    return `${provider.provider.padEnd(16)} ${provider.status.padEnd(11)} ${detail}`
  })
  return [
    `Compared ${result.input}`,
    "",
    "PROVIDER         STATUS      DETAIL",
    ...rows,
  ].join("\n")
}

export function parseOutputs(value: string): Array<ParseOutput> {
  const allowed = new Set<string>(parseOutputIds)
  const outputs = value
    .split(",")
    .map((output) => output.trim())
    .filter((output): output is ParseOutput => allowed.has(output))

  if (outputs.length === 0) {
    throw new Error(`No valid outputs in "${value}".`)
  }
  return [...new Set(outputs)]
}

export function parseProviders(value: string): Array<string> {
  const providers = value
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean)

  if (providers.length === 0) {
    throw new Error("At least one provider is required.")
  }
  return [...new Set(providers)]
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}
