import { z } from "zod"
import { FileRouterError, selectParseOutputs } from "@file_router/sdk"
import type {
  FileRouterProvider,
  ParseResult,
  ProviderInput,
} from "@file_router/sdk"
import type { ProviderId } from "@file_router/sdk/catalog"

const nativeWarningSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    pageNumber: z.number().int().positive().optional(),
  })
  .strict()

const nativePageSchema = z
  .object({
    dimensions: z
      .object({ height: z.number(), width: z.number() })
      .strict()
      .optional(),
    markdown: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    pageNumber: z.number().int().positive(),
    text: z.string().optional(),
  })
  .strict()

const nativeImageSchema = z
  .object({
    data: z.string(),
    id: z.string(),
    mimeType: z.string(),
    pageNumber: z.number().int().positive(),
  })
  .strict()

const nativeResultSchema = z
  .object({
    engine: z
      .object({
        id: z.enum(["liteparse", "pdf-inspector"]),
        version: z.string(),
      })
      .strict(),
    images: z.array(nativeImageSchema).optional(),
    markdown: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()),
    pageCount: z.number().int().nonnegative(),
    pages: z.array(nativePageSchema),
    text: z.string().optional(),
    warnings: z.array(nativeWarningSchema),
  })
  .strict()

const nativeFailureSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string() }).passthrough(),
  })
  .passthrough()

type NativeParserId = Extract<ProviderId, "liteparse" | "pdf-inspector">

type NativeParserConfig = {
  capabilities: FileRouterProvider["capabilities"]
  fetch: (request: Request) => Promise<Response>
  id: NativeParserId
  name: string
}

export function createNativeParserProvider(
  config: NativeParserConfig
): FileRouterProvider {
  return {
    capabilities: config.capabilities,
    id: config.id,
    name: config.name,
    parse: (input, options) => parseNative(config, input, options),
  }
}

async function parseNative(
  config: NativeParserConfig,
  input: ProviderInput,
  options: Parameters<FileRouterProvider["parse"]>[1]
): Promise<ParseResult> {
  if (input.kind !== "url") {
    throw new FileRouterError("Hosted parsers require a document source URL.", {
      code: "InvalidInput",
      providerId: config.id,
    })
  }

  const startedAt = new Date()
  const response = await config.fetch(
    new Request(`https://native-parsers.internal/v1/${config.id}/parse`, {
      headers: {
        "x-filerouter-engine-options": encodeURIComponent(
          JSON.stringify({
            ...(options.pages && { pages: options.pages }),
            ...(options.providerOptions?.[config.id] && {
              providerOptions: options.providerOptions[config.id],
            }),
          })
        ),
        "x-filerouter-source-url": input.url,
      },
      method: "POST",
      ...(options.signal && { signal: options.signal }),
    })
  )
  const value: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw nativeParserError(config.id, response.status, value)
  }

  const parsed = nativeResultSchema.safeParse(value)
  if (!parsed.success || parsed.data.engine.id !== config.id) {
    throw new FileRouterError("Native parser returned an invalid response.", {
      code: "ParseFailed",
      providerId: config.id,
    })
  }

  const native = parsed.data
  const completedAt = new Date()
  const pages = native.pages.map((page) => ({ ...page, warnings: [] }))
  const metadata = { engine: native.engine, ...native.metadata }
  const confidence = native.metadata.confidence
  return {
    id: crypto.randomUUID(),
    outputs: selectParseOutputs(options.outputs ?? ["markdown"], {
      images: native.images,
      markdown: native.markdown,
      metadata,
      pages,
      text: native.text,
    }),
    pageCount: native.pageCount,
    provider: config.id,
    ...(typeof confidence === "number" && {
      quality: { scale: 1, score: confidence },
    }),
    ...(options.includeRaw && { raw: native }),
    timing: {
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
    },
    usage: { pages: pages.length },
    warnings: native.warnings,
  }
}

function nativeParserError(
  providerId: NativeParserId,
  status: number,
  value: unknown
): FileRouterError {
  const parsed = nativeFailureSchema.safeParse(value)
  const failure = parsed.success ? parsed.data.error : undefined
  return new FileRouterError(
    failure?.message ?? "Native parser request failed.",
    {
      code:
        status === 429
          ? "ProviderUnavailable"
          : status === 400 || status === 413
            ? "InvalidInput"
            : "ParseFailed",
      providerId,
      retryable: failure?.code === "capacity_exceeded",
      statusCode: status,
    }
  )
}
