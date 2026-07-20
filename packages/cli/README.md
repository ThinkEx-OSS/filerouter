# @file_router/cli

Parse and compare documents across providers from the terminal.

```bash
npx @file_router/cli login
npx @file_router/cli parse report.pdf
npx @file_router/cli compare report.pdf --json
```

Hosted mode uses a FileRouter API key created during `login`. Direct BYOK mode
calls the selected provider without sending the document or provider key through
FileRouter:

```bash
LLAMA_CLOUD_API_KEY=... npx @file_router/cli parse report.pdf --local
```

See [filerouter.dev](https://filerouter.dev) and the
[source repository](https://github.com/ThinkEx-OSS/filerouter).
