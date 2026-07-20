# Product Shape

FileRouter is provider-neutral document parsing for TypeScript, the terminal,
and a hosted Cloudflare API. The current wedge is portability and comparison,
not automatic quality routing.

## Current Surfaces

- `@file_router/sdk`: direct BYOK SDK and hosted API client.
- `@file_router/cli`: hosted-first CLI with an explicit local BYOK mode.
- Hono API: authenticated job creation and result retrieval.
- Cloudflare Workflow: durable provider submission, polling, cleanup, and result
  persistence.
- TanStack Start app: authentication, API-key management, CLI authorization,
  and minimal product documentation.

## Core Contract

```ts
import { FileRouter } from "@file_router/sdk"
import { llamaparse } from "@file_router/sdk/llamaparse"
import { mistralOcr } from "@file_router/sdk/mistral"

const router = new FileRouter({
  providers: {
    llamaparse: llamaparse(),
    "mistral-ocr": mistralOcr(),
  },
})

const result = await router.parse(file, {
  provider: "llamaparse",
  outputs: ["markdown", "pages"],
})

console.log(result.outputs.markdown)
```

The stable operations are:

- `parse`: process one input with one explicit provider.
- `compare`: process one input with several configured providers.
- `providers`: inspect configured provider capabilities.
- `providerOptions`: pass typed native options without weakening the common
  contract.
- `provider.raw`: access a configured native client where one exists.
- `includeRaw`: opt into the complete provider response for a parse result.

The SDK accepts HTTP URLs, local paths, `File`, `Blob`, `ArrayBuffer`, typed
array views, and web streams. Normalized values live only under
`result.outputs`; page count, usage, quality, timing, and warnings stay at the
result root.

## Providers

The first adapters are LlamaParse, Mistral OCR, and Datalab. Each adapter owns:

- authentication and native client construction;
- conversion from the common input into URL or upload form;
- one-based page-number translation where the provider differs;
- typed provider options;
- output capability declarations;
- normalized errors and results.

Unsupported normalized outputs fail before provider I/O. FileRouter does not
pretend every provider has equivalent tables, images, confidence, or structured
JSON.

## Hosted Boundary

The hosted API adds managed credentials, idempotent jobs, durable polling, and
temporary object storage. It does not change the SDK result contract. Uploaded
documents stream to private R2, providers receive a short-lived scoped source
URL in production, and completed results stream back from R2.

Files above the Worker request ceiling require a future multipart upload
session. Automatic routing, fallbacks, extraction, classification, splitting,
billing, and eval scoring should only be added as separate contracts after the
parse and compare surfaces have real usage data.

## Production Gates

The current system is suitable for local development and controlled trials. A
public managed-key launch still requires three explicit policies:

- cost-aware quotas and billing based on pages/provider spend, not only API
  request rate limits;
- a result-retention contract paired with an R2 lifecycle rule and expired-job
  API behavior;
- direct multipart upload sessions for files above the account's Worker request
  ceiling.

Provider SDKs also decode complete upstream JSON responses. FileRouter bounds
its own R2 writes, but image-heavy or raw provider responses can still approach
the Worker memory limit. `includeRaw` therefore remains opt-in, and production
telemetry must alert on memory failures before larger output modes are enabled.
