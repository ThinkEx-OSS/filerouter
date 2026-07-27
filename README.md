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
  <strong>Infrastructure for the document parsing pipeline you need.</strong>
</p>

FileRouter provides the SDK, CLI, API, and durable execution primitives for
building document parsing pipelines across engines.

Switch providers, compare them on your own documents, and compose the routing
or fallback logic your application needs. FileRouter handles the uploads,
asynchronous jobs, polling, retries, errors, and normalized results behind one
interface.

Improve output quality, cost, latency, and reliability without tying the rest
of your application to one provider.

## What FileRouter gives you

| Need                              | FileRouter                                                               |
| --------------------------------- | ------------------------------------------------------------------------ |
| **Switch providers**              | Change engines without changing input or result handling                 |
| **Compare real documents**        | Run one document across engines and retain every success or failure      |
| **Build routing and fallback**    | Compose cheap-first, parallel, escalation, or fallback flows in your app |
| **Keep one application contract** | Use normalized pages, outputs, timing, usage, warnings, and errors       |
| **Choose where processing runs**  | Use managed hosted jobs or direct/BYOK calls from your own runtime       |

[Explore pipeline recipes →](https://docs.filerouter.dev/guides/overview)

## Get started

```bash
npm install @file_router/sdk
```

```ts
import { FileRouter } from "@file_router/sdk"

const router = new FileRouter()
const result = await router.parse("https://example.com/report.pdf", {
  provider: "liteparse",
  outputs: ["markdown"],
})

console.log(result.outputs.markdown)
```

```bash
npx @file_router/cli@latest login
npx @file_router/cli@latest compare report.pdf \
  --providers liteparse,llamaparse,mistral-ocr \
  --outputs markdown
```

## Hosted or direct

|                       | Hosted                                         | Direct/BYOK                            |
| --------------------- | ---------------------------------------------- | -------------------------------------- |
| Best for              | Managed comparisons and durable jobs           | Keeping provider calls in your runtime |
| Document sent through | FileRouter, then each selected provider        | Each selected provider only            |
| Execution             | Managed uploads, polling, retries, and results | Runs in your process                   |
| Billing               | FileRouter credits                             | Provider billing                       |
| TypeScript            | `FileRouter`                                   | `DirectFileRouter`                     |
| CLI                   | Default after `filerouter login`               | Add `--local`                          |

Neither mode silently falls back to the other. Credits pay for hosted
processing. Each account receives 5,000 free credits each month, purchased
credits never expire, and direct requests do not use FileRouter credits.

[Read about processing modes →](https://docs.filerouter.dev/concepts/processing-modes)

## Engines

| Engine            | Useful for                                                                | Hosted | Direct/BYOK |
| ----------------- | ------------------------------------------------------------------------- | :----: | :---------: |
| **LiteParse**     | Lightweight parsing with optional OCR, screenshots, and Office conversion |  Yes   |      —      |
| **PDF Inspector** | Fast PDF classification and text-layer inspection                         |  Yes   |      —      |
| **Mistral OCR**   | OCR with structured document output                                       |  Yes   |     Yes     |
| **Datalab**       | Document conversion and extraction                                        |  Yes   |     Yes     |
| **LlamaParse**    | Layout-aware document parsing                                             |  Yes   |     Yes     |

<details>
<summary><strong>Tech stack</strong></summary>

- **App:** TypeScript, React 19, TanStack Start, Router, and Query.
- **API and auth:** Hono with OpenAPI and Zod, plus Better Auth.
- **Durable backend:** Cloudflare Workers and Workflows, with D1 through
  Drizzle ORM and R2 for documents and results.
- **SDK and CLI:** A pnpm workspace with provider-neutral TypeScript packages.
- **UI and tooling:** Tailwind CSS 4, Radix UI, Vite+, and Vitest.

</details>

## Supporters

Programs and platforms supporting FileRouter with credits, tools, and
infrastructure.

<p align="center">
  <a href="https://capy.ai/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/capy-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/capy-wordmark-light.svg"><img alt="Capy" src="docs/assets/supporters/capy-wordmark-light.svg" height="42"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.greptile.com/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/greptile-wordmark-green.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/greptile-wordmark-green.svg"><img alt="Greptile" src="docs/assets/supporters/greptile-wordmark-green.svg" height="42"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.thecontextcompany.com/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/the-context-company-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/the-context-company-wordmark-light.svg"><img alt="The Context Company" src="docs/assets/supporters/the-context-company-wordmark-light.svg" height="42"></picture></a>
</p>

<p align="center">
  <a href="https://posthog.com/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/posthog-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/posthog-wordmark-light.svg"><img alt="PostHog" src="docs/assets/supporters/posthog-wordmark-light.svg" height="42"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://mintlify.com/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/mintlify-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/mintlify-wordmark-light.svg"><img alt="Mintlify" src="docs/assets/supporters/mintlify-wordmark-light.svg" height="42"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.coderabbit.ai/"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/supporters/coderabbit-wordmark-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/assets/supporters/coderabbit-wordmark-light.svg"><img alt="CodeRabbit" src="docs/assets/supporters/coderabbit-wordmark-light.svg" height="42"></picture></a>
</p>

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
- [Security](SECURITY.md)
- [Privacy](https://filerouter.dev/privacy)
- [Discord](https://discord.gg/dtPnzkqCcG)
- [GitHub](https://github.com/ThinkEx-OSS/filerouter)
- [X](https://x.com/trythinkex)
- [Email](mailto:hello@thinkex.app)

FileRouter is open source under the [MIT License](LICENSE).
