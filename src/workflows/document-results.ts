import type { ParseOutput, ParseResult } from "@file_router/sdk"

import { putJson, putStream } from "@/lib/r2-json.server"

export type ProviderOutcome =
  | {
      durationMs: number
      error: { code?: string; message: string }
      provider: string
      status: "failed" | "unsupported"
    }
  | {
      durationMs: number
      pageCount: number
      provider: string
      resultKey: string
      status: "parsed"
    }

export async function storeProviderResult(
  bucket: R2Bucket,
  jobId: string,
  result: ParseResult
): Promise<Extract<ProviderOutcome, { status: "parsed" }>> {
  const resultKey = `jobs/${jobId}/providers/${encodeURIComponent(result.provider)}.json`
  await putJson(bucket, resultKey, result)
  return {
    durationMs: result.timing.durationMs,
    pageCount: result.pageCount,
    provider: result.provider,
    resultKey,
    status: "parsed",
  }
}

export async function storeComparisonResult(
  bucket: R2Bucket,
  input: {
    fileName: string
    jobId: string
    outputs: Array<ParseOutput>
    providers: Array<ProviderOutcome>
    startedAt: string
  }
): Promise<{ pageCount: number; resultKey: string }> {
  const completedAt = new Date()
  const resultKey = `jobs/${input.jobId}/result.json`
  const output = new TransformStream<Uint8Array, Uint8Array>()
  await Promise.all([
    writeComparison(output.writable, bucket, input, completedAt),
    putStream(bucket, resultKey, output.readable),
  ])

  return {
    pageCount: Math.max(
      0,
      ...input.providers.map((provider) =>
        provider.status === "parsed" ? provider.pageCount : 0
      )
    ),
    resultKey,
  }
}

async function writeComparison(
  writable: WritableStream<Uint8Array>,
  bucket: R2Bucket,
  input: Parameters<typeof storeComparisonResult>[1],
  completedAt: Date
): Promise<void> {
  const encoder = new TextEncoder()
  const writer = writable.getWriter()
  const writeText = (value: string) => writer.write(encoder.encode(value))
  try {
    await writeText(
      `{"input":${JSON.stringify(input.fileName)},"outputs":${JSON.stringify(input.outputs)},"providers":[`
    )
    for (const [index, provider] of input.providers.entries()) {
      if (index > 0) {
        await writeText(",")
      }
      if (provider.status !== "parsed") {
        await writeText(JSON.stringify(provider))
        continue
      }

      const result = await bucket.get(provider.resultKey)
      if (!result) {
        throw new Error(
          `Stored result for ${provider.provider} is unavailable.`
        )
      }
      await writeText(
        `{"durationMs":${provider.durationMs},"provider":${JSON.stringify(provider.provider)},"result":`
      )
      await writeBody(writer, result)
      await writeText(',"status":"parsed"}')
    }
    await writeText(
      `],"timing":${JSON.stringify({
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - new Date(input.startedAt).getTime(),
        startedAt: input.startedAt,
      })}}`
    )
    await writer.close()
  } catch (error) {
    await writer.abort(error)
    throw error
  }
}

async function writeBody(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  object: R2ObjectBody
): Promise<void> {
  const reader = object.body.getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        return
      }
      await writer.write(chunk.value)
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}
