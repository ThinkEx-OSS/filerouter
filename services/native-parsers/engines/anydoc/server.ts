import runtimePackage from "./package.json" with { type: "json" }
import { parseAnydoc } from "./parse.ts"

import { startParserServer } from "../shared/http.ts"

const ENGINE_VERSION = runtimePackage.dependencies["@firecrawl/anydoc"]
const MAX_INPUT_BYTES = 100 * 1024 * 1024
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

startParserServer({
  handler: ({ bytes, fileName, options }) =>
    parseAnydoc(bytes, fileName, options, ENGINE_VERSION),
  maxBytes: MAX_INPUT_BYTES,
  maxConcurrency: 1,
  maxResponseBytes: MAX_OUTPUT_BYTES,
  parserId: "anydoc",
})
