import { defineCommand } from "citty"

import { login } from "./login"
import {
  formatCompareResult,
  formatParseResult,
  parseOutputs,
  parseProviders,
} from "./output"
import type { CliRuntime } from "./runtime"
import { providerIds } from "./runtime"

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
        default: "llamaparse",
      },
      outputs: {
        type: "string",
        alias: ["o"],
        description: "Comma-separated outputs.",
        default: "markdown",
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
        default: providerIds.join(","),
      },
      outputs: {
        type: "string",
        alias: ["o"],
        description: "Comma-separated outputs.",
        default: "markdown",
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
      const result = await (
        await runtime.createRouter(args.local)
      ).compare(args.input, {
        outputs: parseOutputs(args.outputs),
        providers: parseProviders(args.providers),
      })
      await writeOutput(
        runtime,
        formatCompareResult(result, args.json),
        args.out
      )
    },
  })
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
