import type { ParseResult } from "@file_router/sdk"

import { putJson } from "@/lib/r2-json.server"

export type ProviderOutcome =
  | {
      durationMs: number
      error: { code?: string; message: string }
      executionId: string
      provider: string
      status: "failed"
    }
  | {
      durationMs: number
      engine?: { id: string; version: string }
      executionId: string
      pageCount: number
      provider: string
      resultKey: string
      status: "parsed"
      usage?: ParseResult["usage"]
    }

export async function storeProviderResult(
  bucket: R2Bucket,
  executionId: string,
  result: ParseResult
): Promise<Extract<ProviderOutcome, { status: "parsed" }>> {
  const resultKey = `executions/${executionId}/result.json`
  await putJson(bucket, resultKey, result)
  const engine = readEngine(result.outputs.metadata?.engine)
  return {
    durationMs: result.timing.durationMs,
    ...(engine && { engine }),
    executionId,
    pageCount: result.pageCount,
    provider: result.provider,
    resultKey,
    status: "parsed",
    ...(result.usage && { usage: result.usage }),
  }
}

function readEngine(
  value: unknown
): { id: string; version: string } | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("id" in value) ||
    !("version" in value) ||
    typeof value.id !== "string" ||
    typeof value.version !== "string"
  ) {
    return undefined
  }
  return { id: value.id, version: value.version }
}
