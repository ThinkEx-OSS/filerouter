import { FileRouterError, toFileRouterError } from "./errors"
import { describeInput, resolveParseInput } from "./internal/input"
import { assertPages, assertTimeoutMs } from "./internal/provider-options"
import { DEFAULT_PARSE_OUTPUT } from "./types"
import type {
  CompareOptions,
  CompareProviderResult,
  CompareResult,
  FileRouterProvider,
  ParseInput,
  ParseOptions,
  ParseOutput,
  ParseResult,
  ProviderMap,
} from "./types"

export interface DirectFileRouterOptions<
  Providers extends ProviderMap = ProviderMap,
> {
  defaultProvider?: keyof Providers & string
  providers: Providers
}

export class DirectFileRouter<Providers extends ProviderMap = ProviderMap> {
  readonly #defaultProvider: string | undefined
  readonly #providers: Providers

  constructor(opts: DirectFileRouterOptions<Providers>) {
    this.#providers = opts.providers
    this.#defaultProvider = opts.defaultProvider
  }

  get providers(): Providers {
    return this.#providers
  }

  async parse(
    input: ParseInput,
    options: ParseOptions = {}
  ): Promise<ParseResult> {
    assertPages(options.pages)
    assertTimeoutMs(options.timeoutMs)
    const provider = this.#selectProvider(options.provider)
    const outputs = options.outputs ?? [DEFAULT_PARSE_OUTPUT]

    assertProviderOutputs(provider, outputs)
    const normalizedInput = await resolveParseInput(input)

    try {
      return await provider.parse(normalizedInput, { ...options, outputs })
    } catch (error) {
      throw toFileRouterError(error, {
        code: "ParseFailed",
        providerId: provider.id,
      })
    }
  }

  async compare(
    input: ParseInput,
    options: CompareOptions = {}
  ): Promise<CompareResult> {
    assertPages(options.pages)
    assertTimeoutMs(options.timeoutMs)
    const startedAt = new Date()
    const outputs = options.outputs ?? [DEFAULT_PARSE_OUTPUT]
    const providerIds = options.providers ?? Object.keys(this.#providers)
    const normalizedInput = await resolveParseInput(input)
    const providers = await Promise.all(
      providerIds.map((providerId) =>
        this.#compareProvider(providerId, normalizedInput, {
          ...options,
          outputs,
        })
      )
    )
    const completedAt = new Date()

    return {
      input: describeInput(input),
      outputs,
      providers,
      timing: {
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        startedAt: startedAt.toISOString(),
      },
    }
  }

  async #compareProvider(
    providerId: string,
    input: Parameters<FileRouterProvider["parse"]>[0],
    options: ParseOptions
  ): Promise<CompareProviderResult> {
    const startedAt = Date.now()
    const provider = this.#providers[providerId]

    if (!provider) {
      return {
        durationMs: Date.now() - startedAt,
        error: {
          code: "ProviderNotFound",
          message: `Provider "${providerId}" is not configured.`,
        },
        provider: providerId,
        status: "failed",
      }
    }

    try {
      assertProviderOutputs(provider, options.outputs ?? [DEFAULT_PARSE_OUTPUT])
    } catch (error) {
      return {
        durationMs: Date.now() - startedAt,
        error: serializeProviderError(error),
        provider: provider.id,
        status: "unsupported",
      }
    }

    try {
      const result = await provider.parse(input, {
        ...options,
        provider: provider.id,
      })

      return {
        durationMs: Date.now() - startedAt,
        provider: provider.id,
        result,
        status: "parsed",
      }
    } catch (error) {
      return {
        durationMs: Date.now() - startedAt,
        error: serializeProviderError(
          toFileRouterError(error, {
            code: "ParseFailed",
            providerId: provider.id,
          })
        ),
        provider: provider.id,
        status: "failed",
      }
    }
  }

  #selectProvider(providerId: string | undefined): FileRouterProvider {
    const resolvedProviderId =
      providerId ?? this.#defaultProvider ?? Object.keys(this.#providers)[0]

    if (!resolvedProviderId) {
      throw new FileRouterError("FileRouter requires at least one provider.", {
        code: "ProviderNotFound",
      })
    }

    const provider = this.#providers[resolvedProviderId]
    if (!provider) {
      throw new FileRouterError(
        `Provider "${resolvedProviderId}" is not configured.`,
        {
          code: "ProviderNotFound",
          providerId: resolvedProviderId,
        }
      )
    }

    return provider
  }
}

export const createFileRouter = <Providers extends ProviderMap>(
  opts: DirectFileRouterOptions<Providers>
): DirectFileRouter<Providers> => new DirectFileRouter(opts)

export const assertProviderOutputs = (
  provider: FileRouterProvider,
  outputs: Array<ParseOutput>
): void => {
  const supported = new Set(provider.capabilities.outputs)
  const unsupported = outputs.filter((output) => !supported.has(output))

  if (unsupported.length > 0) {
    throw new FileRouterError(
      `Provider "${provider.id}" does not support output(s): ${unsupported.join(", ")}.`,
      {
        code: "ProviderUnsupportedOutput",
        providerId: provider.id,
      }
    )
  }
}

export const serializeProviderError = (
  error: unknown
): { code?: string; message: string } => {
  if (FileRouterError.isInstance(error)) {
    return {
      code: error.code,
      message: error.message,
    }
  }

  return {
    message: error instanceof Error ? error.message : "Unknown error",
  }
}
