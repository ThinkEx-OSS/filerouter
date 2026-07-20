import { defineCommand } from "citty"

import {
  createCompareCommand,
  createLoginCommand,
  createParseCommand,
  createProvidersCommand,
} from "./commands"
import { createDefaultRuntime } from "./runtime"
import type { CliRuntime } from "./runtime"

export function createMainCommand(
  runtime: CliRuntime = createDefaultRuntime()
) {
  return defineCommand({
    meta: {
      name: "filerouter",
      version: "0.1.0",
      description: "Parse and compare documents across providers.",
    },
    subCommands: {
      compare: createCompareCommand(runtime),
      login: createLoginCommand(runtime),
      parse: createParseCommand(runtime),
      providers: createProvidersCommand(runtime),
    },
  })
}
