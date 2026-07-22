<p align="center">
  <a href="https://filerouter.dev">
    <img alt="FileRouter" src="docs/assets/filerouter-logo.svg" width="92">
  </a>
</p>

<h1 align="center">FileRouter</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@file_router/sdk"><img alt="FileRouter SDK on npm" src="https://shieldcn.dev/npm/@file_router/sdk.svg?variant=secondary&size=sm"></a>
  <a href="https://docs.filerouter.dev"><img alt="FileRouter documentation" src="https://shieldcn.dev/badge/Docs-read-00bdf7.svg?variant=secondary&size=sm"></a>
  <a href="https://github.com/ThinkEx-OSS/filerouter/stargazers"><img alt="GitHub stars" src="https://shieldcn.dev/github/stars/ThinkEx-OSS/filerouter.svg?variant=secondary&size=sm&theme=amber"></a>
  <a href="https://discord.gg/dtPnzkqCcG"><img alt="Join Discord" src="https://shieldcn.dev/badge/Discord-join-5865f2.svg?variant=secondary&size=sm&logo=discord"></a>
</p>

<p align="center">
  <strong>Durable document parsing across providers.</strong>
</p>

FileRouter gives you one TypeScript SDK and CLI for durable document parsing
across providers. Choose a parser, compare the same document across parsers, or
call providers directly with your own keys.

## What FileRouter handles

Each parser has its own SDK, input rules, options, async job flow, and response
shape. Supporting more than one usually means rebuilding the same document
pipeline. FileRouter handles that work behind one interface:

- **Inputs:** pass a file path, URL, `File`, `Blob`, buffer, or stream.
- **Provider adapters:** keep each provider's authentication and options
  separate without changing the rest of your app.
- **Long-running jobs:** hosted processing manages uploads, provider submission,
  polling, timeouts, result storage, and cleanup.
- **Consistent results:** work with the same page numbering, outputs, timing,
  warnings, and errors across providers.
- **Side-by-side comparisons:** parse a document with multiple providers at
  once and keep each success or failure in one result.

Start with one parser today. Switching or comparing later is a configuration
change, not another document integration.

## Get started

Install the SDK:

```bash
npm install @file_router/sdk
```

Parse a document with the hosted API:

```ts
import { FileRouterClient } from "@file_router/sdk"

const client = new FileRouterClient({
  apiKey: process.env.FILEROUTER_API_KEY,
})

const result = await client.parse("https://example.com/report.pdf", {
  provider: "llamaparse",
  outputs: ["markdown"],
})

console.log(result.outputs.markdown)
```

Or use the CLI:

```bash
npx @file_router/cli@latest login
npx @file_router/cli@latest parse report.pdf
```

## Hosted or direct

|                       | Hosted API                             | Direct with your keys                  |
| --------------------- | -------------------------------------- | -------------------------------------- |
| Best for              | The fastest setup                      | Keeping provider calls in your runtime |
| Authentication        | A FileRouter API key                   | Your provider API keys                 |
| Document sent through | FileRouter, then the selected provider | The selected provider only             |
| Billing               | FileRouter credits                     | Provider billing                       |
| TypeScript            | `FileRouterClient`                     | `FileRouter`                           |
| CLI                   | Default after `filerouter login`       | Add `--local`                          |

Credits pay for hosted processing. Each account receives 5,000 free credits each month, purchased credits never expire, and direct requests do not use FileRouter credits.

Direct TypeScript example:

```ts
import { FileRouter } from "@file_router/sdk"
import { llamaparse } from "@file_router/sdk/llamaparse"

const router = new FileRouter({
  providers: { llamaparse: llamaparse() },
})

const result = await router.parse("./report.pdf", {
  provider: "llamaparse",
  outputs: ["markdown"],
})
```

## Adapters

- **LlamaParse** for layout-aware document parsing.
- **Mistral OCR** for OCR with structured document output.
- **Datalab** for document conversion and extraction.
- **LiteParse** for open-source parsing with optional OCR, screenshots, and
  Office conversion.
- **PDF Inspector** for fast PDF classification and text-layer inspection.

More adapters are coming.

<details>
<summary><strong>Tech stack</strong></summary>

- **App:** TypeScript, React 19, TanStack Start, Router, and Query.
- **API and auth:** Hono with OpenAPI and Zod, plus Better Auth.
- **Durable backend:** Cloudflare Workers and Workflows, with D1 through
  Drizzle ORM and R2 for documents and results.
- **SDK and CLI:** A pnpm workspace with provider-neutral TypeScript packages.
- **UI and tooling:** Tailwind CSS 4, Radix UI, Vite+, and Vitest.

</details>

## Development

FileRouter requires Node.js 22.14 or newer.

```bash
vp install
pnpm dev
```

Run the checks before pushing changes:

```bash
pnpm check
pnpm test
```

## Community

- [Website](https://filerouter.dev)
- [Documentation](https://docs.filerouter.dev)
- [Discord](https://discord.gg/dtPnzkqCcG)
- [GitHub](https://github.com/ThinkEx-OSS/filerouter)
- [X](https://x.com/trythinkex)
- [Email](mailto:hello@thinkex.app)

FileRouter is open source under the [MIT License](LICENSE).
