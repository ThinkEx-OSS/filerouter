import { fileURLToPath } from "node:url"

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vite-plus"

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./test/worker/entry.ts",
      miniflare: {
        bindings: {
          BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
          BETTER_AUTH_URL: "https://filerouter.test",
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL("./drizzle", import.meta.url))
          ),
        },
        serviceBindings: {
          NATIVE_PARSERS: {
            network: { deny: ["0.0.0.0/0", "::/0"] },
          },
        },
      },
      wrangler: { configPath: "./wrangler.jsonc" },
    })),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["test/worker/**/*.test.ts"],
    setupFiles: ["./test/worker/setup.ts"],
  },
})
