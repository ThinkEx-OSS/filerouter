# @file_router/sdk

Provider-neutral document parsing for TypeScript. Use the hosted FileRouter API
or call LlamaParse, Mistral OCR, and Datalab directly with your own keys.

```bash
pnpm add @file_router/sdk
```

## Hosted

```ts
import { FileRouter } from "@file_router/sdk"

const router = new FileRouter({ apiKey: process.env.FILEROUTER_API_KEY })
const result = await router.parse("https://example.com/report.pdf", {
  provider: "llamaparse",
  outputs: ["markdown", "pages"],
})

console.log(result.outputs.markdown)
```

## Direct BYOK

```ts
import { DirectFileRouter } from "@file_router/sdk"
import { llamaparse } from "@file_router/sdk/llamaparse"

const router = new DirectFileRouter({
  providers: { llamaparse: llamaparse() },
})

const result = await router.parse(file, {
  provider: "llamaparse",
  outputs: ["markdown"],
})
```

See [filerouter.dev](https://filerouter.dev) and the
[source repository](https://github.com/ThinkEx-OSS/filerouter).
