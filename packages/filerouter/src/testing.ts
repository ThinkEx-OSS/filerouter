import type {
  FileRouterProvider,
  ParseOptions,
  ParseResult,
  ProviderInput,
} from "./types"
import { DEFAULT_PARSE_OUTPUT } from "./types"

export interface FakeProviderOptions {
  id?: string
  name?: string
  result?: Partial<ParseResult>
}

export const fakeProvider = (
  opts: FakeProviderOptions = {}
): FileRouterProvider => {
  const id = opts.id ?? "fake"

  return {
    capabilities: {
      execution: "sync",
      outputs: [
        "markdown",
        "text",
        "pages",
        "tables",
        "images",
        "json",
        "metadata",
        "html",
      ],
    },
    id,
    name: opts.name ?? "Fake Provider",
    raw: opts,
    parse: (
      _input: ProviderInput,
      options: ParseOptions
    ): Promise<ParseResult> => {
      const startedAt = new Date()
      const completedAt = new Date()
      const outputs = options.outputs ?? [DEFAULT_PARSE_OUTPUT]
      const values: ParseResult["outputs"] = {
        markdown: "# Fake document",
        pages: [
          {
            markdown: "# Fake document",
            pageNumber: 1,
            text: "Fake document",
            warnings: [],
          },
        ],
        text: "Fake document",
        ...opts.result?.outputs,
      }
      const selected: ParseResult["outputs"] = {}
      for (const output of outputs) {
        if (values[output] !== undefined) {
          ;(selected as Record<string, unknown>)[output] = values[output]
        }
      }

      const result: ParseResult = {
        id: opts.result?.id ?? "fake-result",
        outputs: selected,
        pageCount: opts.result?.pageCount ?? 1,
        provider: id,
        ...(options.includeRaw && {
          raw: { inputKind: typeof _input, options },
        }),
        timing: {
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - startedAt.getTime(),
          startedAt: startedAt.toISOString(),
        },
        warnings: opts.result?.warnings ?? [],
      }

      if (opts.result?.usage) {
        result.usage = opts.result.usage
      }

      return Promise.resolve(result)
    },
  }
}
