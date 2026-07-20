# Environment

FileRouter reads runtime configuration from Cloudflare bindings and Worker
secrets. Local development uses Wrangler's standard `.dev.vars` file.

## Local Setup

Create the ignored local secrets file:

```bash
cp .dev.vars.example .dev.vars
```

Generate a development auth secret instead of using the placeholder:

```bash
openssl rand -base64 32
```

Then start the app:

```bash
pnpm dev
```

The Cloudflare development runtime loads `.dev.vars` automatically. Shell
environment variables may still be used for temporary overrides. Never commit
`.dev.vars`; it is covered by `.gitignore`.

Use `wrangler secret put NAME` for deployed Worker secrets. `.dev.vars` is only
for local development.

## Runtime Variables

Local variable names come from `.dev.vars`; deployed secrets are configured
with Wrangler. `BETTER_AUTH_URL` is the one non-secret value in this table and
must be the canonical, publicly reachable origin in production. Workflows use
that origin for short-lived provider source URLs.

| Variable               | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `BETTER_AUTH_SECRET`   | Signs auth state and scoped provider source URLs      |
| `BETTER_AUTH_URL`      | Canonical public app origin                           |
| `GOOGLE_CLIENT_ID`     | Enables Google sign-in when paired with the secret    |
| `GOOGLE_CLIENT_SECRET` | Enables Google sign-in when paired with the client ID |
| `LLAMA_CLOUD_API_KEY`  | Enables hosted LlamaParse jobs                        |
| `MISTRAL_API_KEY`      | Enables hosted Mistral OCR jobs                       |
| `DATALAB_API_KEY`      | Enables hosted Datalab jobs                           |

Google credentials are required for dashboard sign-in. Provider and API-key
flows can still be exercised directly in local tests without Google OAuth.
