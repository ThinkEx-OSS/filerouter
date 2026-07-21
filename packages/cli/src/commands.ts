import { defineCommand } from "citty"
import { DEFAULT_PARSE_OUTPUT } from "@file_router/sdk"
import {
  DEFAULT_PROVIDER_ID,
  localProviderIds,
  providerIds,
} from "@file_router/sdk/catalog"

import { login } from "./login"
import {
  formatCompareResult,
  formatParseResult,
  parseOutputs,
  parseProviders,
} from "./output"
import type { CliRuntime } from "./runtime"

export function createParseCommand(runtime: CliRuntime) {
  return defineCommand({
    meta: {
      name: "parse",
      description: "Parse a document with one provider.",
    },
    args: {
      input: {
        type: "positional",
        description: "Local file path or public URL.",
        required: true,
      },
      provider: {
        type: "enum",
        alias: ["p"],
        description: "Document provider.",
        options: [...providerIds],
        default: DEFAULT_PROVIDER_ID,
      },
      outputs: {
        type: "string",
        alias: ["o"],
        description: "Comma-separated outputs.",
        default: DEFAULT_PARSE_OUTPUT,
      },
      json: {
        type: "boolean",
        description: "Write the complete result as JSON.",
        default: false,
      },
      out: {
        type: "string",
        description: "Write output to a file instead of stdout.",
      },
      local: {
        type: "boolean",
        description: "Use your provider API keys directly.",
        default: false,
      },
    },
    async run({ args }) {
      assertProviderAvailable(args.provider, args.local)
      const outputs = parseOutputs(args.outputs)
      const result = await (
        await runtime.createRouter(args.local)
      ).parse(args.input, {
        outputs,
        provider: args.provider,
      })
      await writeOutput(
        runtime,
        formatParseResult(result, outputs, args.json),
        args.out
      )
    },
  })
}

export function createCompareCommand(runtime: CliRuntime) {
  return defineCommand({
    meta: {
      name: "compare",
      description: "Run the same document through multiple providers.",
    },
    args: {
      input: {
        type: "positional",
        description: "Local file path or public URL.",
        required: true,
      },
      providers: {
        type: "string",
        alias: ["p"],
        description: "Comma-separated provider IDs.",
      },
      outputs: {
        type: "string",
        alias: ["o"],
        description: "Comma-separated outputs.",
        default: DEFAULT_PARSE_OUTPUT,
      },
      json: {
        type: "boolean",
        description: "Write the complete comparison as JSON.",
        default: false,
      },
      out: {
        type: "string",
        description: "Write output to a file instead of stdout.",
      },
      local: {
        type: "boolean",
        description: "Use your provider API keys directly.",
        default: false,
      },
    },
    async run({ args }) {
      const providers = args.providers
        ? parseProviders(args.providers)
        : args.local
          ? [...localProviderIds]
          : [...providerIds]
      providers.forEach((provider) =>
        assertProviderAvailable(provider, args.local)
      )
      const result = await (
        await runtime.createRouter(args.local)
      ).compare(args.input, {
        outputs: parseOutputs(args.outputs),
        providers,
      })
      await writeOutput(
        runtime,
        formatCompareResult(result, args.json),
        args.out
      )
    },
  })
}

const localProviderIdSet = new Set<string>(localProviderIds)

function assertProviderAvailable(provider: string, local: boolean): void {
  if (local && !localProviderIdSet.has(provider)) {
    throw new Error(
      `${provider} is hosted-only in this CLI build. Remove --local or choose ${localProviderIds.join(", ")}.`
    )
  }
}

export function createProvidersCommand(runtime: CliRuntime) {
  return defineCommand({
    meta: {
      name: "providers",
      description: "List available document providers.",
    },
    args: {
      json: {
        type: "boolean",
        description: "Write provider metadata as JSON.",
        default: false,
      },
    },
    run({ args }) {
      const providers = Object.values(runtime.listProviders()).map(
        ({ capabilities, id, name }) => ({ capabilities, id, name })
      )
      const output = args.json
        ? JSON.stringify(providers, null, 2)
        : providers
            .map(
              (provider) =>
                `${provider.id.padEnd(16)} ${provider.capabilities.outputs.join(", ")}`
            )
            .join("\n")
      runtime.writeStdout(`${output}\n`)
    },
  })
}

export function createLoginCommand(runtime: CliRuntime) {
  return defineCommand({
    meta: {
      name: "login",
      description: "Authenticate this CLI with FileRouter.",
    },
    run: () => login(runtime),
  })
}

async function writeOutput(
  runtime: CliRuntime,
  output: string,
  path?: string
): Promise<void> {
  const content = output.endsWith("\n") ? output : `${output}\n`
  if (path) {
    await runtime.writeFile(path, content)
    return
  }
  runtime.writeStdout(content)
}
