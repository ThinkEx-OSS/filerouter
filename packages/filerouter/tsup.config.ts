import { defineConfig } from "tsup"

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    catalog: "src/catalog.ts",
    datalab: "src/datalab.ts",
    hosted: "src/hosted.ts",
    index: "src/index.ts",
    inspect: "src/inspect.ts",
    llamaparse: "src/llamaparse.ts",
    mistral: "src/mistral.ts",
    testing: "src/testing.ts",
  },
  external: ["@llamaindex/llama-cloud", "@mistralai/mistralai"],
  format: ["esm"],
  sourcemap: true,
  target: "es2022",
})
