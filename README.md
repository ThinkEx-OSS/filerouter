# FileRouter

Provider-neutral document processing for TypeScript, the terminal, and the web.

The goal is similar to OpenRouter, but for files: one API over document parsing
providers. The first supported providers are LlamaParse, Mistral OCR, and
Datalab. The hosted Cloudflare app is the control plane; the TypeScript SDK and
CLI share its contract.

## Source Layout

- `packages/filerouter`: provider-neutral TypeScript SDK, hosted client, test
  provider, and three provider adapters.
- `packages/cli`: hosted-first CLI over the SDK, with an optional local BYOK
  mode.
- `src/api`: Hono API and its OpenAPI contract.
- `src/workflows`: durable Cloudflare document processing.
- `src/routes`: thin TanStack Start cloud surface.
- `.github/workflows`: CI, Cloudflare deployment, and npm publishing.
- `infra`: deployed storage lifecycle configuration.

## Development

Install dependencies:

```bash
vp install
```

Run locally:

```bash
pnpm dev
```

`pnpm dev` starts the TanStack Start development server and loads local Worker
secrets from `.dev.vars`. Copy `.dev.vars.example` to `.dev.vars` before first
run.

Validate:

```bash
pnpm exec vp check
pnpm build
```

The OpenAPI 3.1 contract is available at `/api/openapi.json`. Hosted job
creation requires an `Idempotency-Key` header; the TypeScript client generates
one automatically and accepts `idempotencyKey` in hosted parse and compare
options for explicit retries. Cloudflare Workflows durably polls asynchronous
providers without resubmitting the document. Hosted binary uploads are limited
to 100 MB; production workflows give providers a short-lived streaming source
URL instead of buffering the R2 object in Worker memory. Uploaded sources are
deleted after processing, results expire after seven days, and job records are
removed after 30 days. Direct BYOK SDK calls retain each provider's native file
limits.

Run SDK tests:

```bash
pnpm --filter @file_router/sdk test
```

## SDK Contract

Shared behavior uses portable FileRouter options. Document page numbers are
always one-based and are translated into each provider's native representation.
Provider-specific options are namespaced, so comparisons never send one
provider's settings to another:

```ts
const result = await router.parse(file, {
  outputs: ["markdown", "images"],
  pages: [1, 3],
  provider: "llamaparse",
  providerOptions: {
    llamaparse: {
      agentic_options: { custom_prompt: "Preserve footnotes" },
      tier: "agentic",
    },
  },
})
```

LlamaParse and Mistral options use their official SDK request types. Datalab
exposes its documented native fields and a `raw` object for newly released
provider options. FileRouter applies the input source and authentication-owned
fields after native options, so provider escape hatches cannot redirect a job.
Normalized values live only under `result.outputs`; page count, usage, quality,
warnings, and timing stay at the result root. Set `includeRaw: true` when a
complete provider response is worth the additional memory and response size.

## CLI

Authenticate once, then parse or compare a local file or public URL through the
hosted service:

```bash
pnpm cli login
pnpm cli parse report.pdf
pnpm cli parse report.pdf --provider mistral-ocr
pnpm cli providers
pnpm cli compare report.pdf --json
```

For direct BYOK processing, set the provider's standard environment variable
and add `--local`:

```bash
LLAMA_CLOUD_API_KEY=... pnpm cli parse report.pdf --local
```

After publishing, the same commands run without a permanent installation:

```bash
npx @file_router/cli parse report.pdf
```

Deploy to Cloudflare Workers:

```bash
pnpm run deploy
```
