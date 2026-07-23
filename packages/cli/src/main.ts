import { defineCommand } from "citty"
import { FILEROUTER_VERSION } from "@file_router/sdk"

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
      version: FILEROUTER_VERSION,
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
