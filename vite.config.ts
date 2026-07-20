import { cloudflare } from "@cloudflare/vite-plugin"
import contentCollections from "@content-collections/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import tailwindcss from "@tailwindcss/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins } from "vite-plus"

export default defineConfig(({ mode }) => ({
  lint: {
    categories: { correctness: "warn" },
    env: { browser: true, builtin: true, es2020: true },
    ignorePatterns: ["**/coverage/**", "**/dist/**", "src/routeTree.gen.ts"],
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    plugins: ["oxc", "typescript", "unicorn", "react", "import"],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  fmt: {
    endOfLine: "lf",
    ignorePatterns: ["pnpm-lock.yaml", "src/routeTree.gen.ts"],
    printWidth: 80,
    semi: false,
    singleQuote: false,
    sortTailwindcss: {
      functions: ["cn", "cva"],
      stylesheet: "src/styles.css",
    },
    tabWidth: 2,
    trailingComma: "es5",
  },
  staged: {
    "*.{js,jsx,ts,tsx}": "vp check --fix",
    "*.{css,json,jsonc,md,mdx,yaml,yml}": "vp fmt --write",
  },
  test: {
    exclude: ["node_modules/**", "dist/**"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => [
    devtools(),
    contentCollections(),
    tailwindcss(),
    ...(mode === "test"
      ? []
      : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
    tanstackStart(),
    viteReact(),
  ]),
}))
