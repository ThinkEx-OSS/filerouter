import { FileRouterError, toFileRouterError } from "./errors"
import { describeInput, resolveParseInput } from "./internal/input"
import { selectPageFields } from "./internal/outputs"
import {
  assertPageFields,
  assertPages,
  assertTimeoutMs,
} from "./internal/provider-options"
import { withTimeout } from "./internal/timeout"
import { DEFAULT_PARSE_OUTPUT } from "./types"
import type {
  CompareOptions,
  CompareProviderResult,
  CompareResult,
  FileRouterProvider,
  ParseInput,
  ParseOptions,
  ParseOutput,
  ParsePageField,
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

    assertPageFields(outputs, options.pageFields)
    assertProviderOutputs(provider, outputs)
    assertProviderPageFields(provider, options.pageFields)

    const run = async (signal: AbortSignal | undefined) => {
      const normalizedInput = await resolveParseInput(input, signal)
      signal?.throwIfAborted()
      try {
        return selectPageFields(
          await provider.parse(normalizedInput, {
            ...options,
            outputs,
            ...(signal && { signal }),
          }),
          options.pageFields
        )
      } catch (error) {
        throw toFileRouterError(error, {
          code: "ParseFailed",
          providerId: provider.id,
        })
      }
    }
    return options.timeoutMs === undefined
      ? run(options.signal)
      : withTimeout(options.timeoutMs, options.signal, run)
  }

  async compare(
    input: ParseInput,
    options: CompareOptions = {}
  ): Promise<CompareResult> {
    assertPages(options.pages)
    assertTimeoutMs(options.timeoutMs)
    const startedAt = new Date()
    const outputs = options.outputs ?? [DEFAULT_PARSE_OUTPUT]
    assertPageFields(outputs, options.pageFields)
    const providerIds = options.providers ?? Object.keys(this.#providers)
    const run = async (signal: AbortSignal | undefined) => {
      const normalizedInput = await resolveParseInput(input, signal)
      signal?.throwIfAborted()
      const providers = await Promise.all(
        providerIds.map((providerId) =>
          this.#compareProvider(providerId, normalizedInput, {
            ...options,
            outputs,
            ...(signal && { signal }),
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
    return options.timeoutMs === undefined
      ? run(options.signal)
      : withTimeout(options.timeoutMs, options.signal, run)
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
      assertProviderPageFields(provider, options.pageFields)
    } catch (error) {
      return {
        durationMs: Date.now() - startedAt,
        error: serializeProviderError(error),
        provider: provider.id,
        status: "unsupported",
      }
    }

    try {
      const result = selectPageFields(
        await provider.parse(input, {
          ...options,
          provider: provider.id,
        }),
        options.pageFields
      )

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

export const assertProviderPageFields = (
  provider: FileRouterProvider,
  pageFields: Array<ParsePageField> | undefined
): void => {
  if (!pageFields) {
    return
  }
  const supported = new Set(provider.capabilities.pageFields ?? [])
  const unsupported = pageFields.filter((field) => !supported.has(field))

  if (unsupported.length > 0) {
    throw new FileRouterError(
      `Provider "${provider.id}" does not support page field(s): ${unsupported.join(", ")}.`,
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
