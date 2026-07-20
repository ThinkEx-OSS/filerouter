import { defineConfig } from "tsup"

export default defineConfig({
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  dts: false,
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  minify: false,
  sourcemap: true,
  target: "node22",
})
