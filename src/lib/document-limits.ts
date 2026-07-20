/** Cloudflare Free and Pro plans accept request bodies up to 100 MB. */
export const MAX_HOSTED_UPLOAD_BYTES = 100_000_000
export const MAX_HOSTED_UPLOAD_LABEL = "100 MB"

/** Local provider testing cannot expose an R2-backed source URL externally. */
export const MAX_BUFFERED_PROVIDER_BYTES = 25 * 1024 * 1024
