# Releasing FileRouter

FileRouter has three independent automation boundaries:

- `ci.yml` validates every pull request and every push to `main`.
- `deploy.yml` deploys the application after successful `main` CI.
- `publish.yml` publishes versioned SDK and CLI packages from `v*` tags.

## GitHub setup

Create two GitHub environments:

- `production`: require approval and add `CLOUDFLARE_ACCOUNT_ID` plus a
  narrowly scoped `CLOUDFLARE_API_TOKEN`.
- `npm`: require approval. It does not need a long-lived npm token.

Protect `main` and require the `Verify` check before merging. Add a tag ruleset
for `v*` so only release maintainers can create or update publish-triggering
tags. Provider keys, Better Auth secrets, and other runtime values belong in
Cloudflare, not GitHub.

The production D1 database and R2 bucket must exist before the first deployment.
Add the D1 `database_id` to `wrangler.jsonc`, apply the R2 lifecycle policy once,
and configure the production Google OAuth callback before enabling deployment.

## First npm publish

npm trusted publishing can only be configured after a package exists. Enable
2FA on the npm account, build and inspect both tarballs, then publish `0.1.0`
manually from a clean commit. After both packages exist, configure a trusted
publisher on each npm package with:

- GitHub owner: `ThinkEx-OSS`
- Repository: `filerouter`
- Workflow: `publish.yml`
- Environment: `npm`
- Allowed action: `npm publish`

Then set package publishing access to require 2FA and disallow traditional
tokens. Future releases use short-lived GitHub OIDC credentials and automatic
npm provenance.

## Later releases

Update both package versions together, merge the release commit, and create a
matching tag:

```bash
git tag v0.1.1
git push origin v0.1.1
```

The workflow verifies that the tag matches both package versions, rebuilds and
tests the repository, packs with pnpm so workspace dependencies become registry
versions, and publishes with the npm CLI. Existing versions are skipped, making
reruns safe after partial registry failures.
