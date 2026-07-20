# R2 Architecture

R2 is FileRouter's private data plane. D1 stores job metadata; Workflows owns
durable provider orchestration; R2 stores document bytes and result JSON.

## Current Retention

- Uploaded source objects are deleted as soon as the document Workflow succeeds
  or fails. Startup failures also remove sources that were uploaded before the
  job could be created.
- Intermediate per-provider result objects are deleted after a comparison is
  assembled and after failed jobs. Cleanup failures are logged and left for a
  future bucket lifecycle rule to catch.
- Successful final results expire after seven days. The API stops serving them
  at their exact expiry time, and an hourly cleanup deletes their R2 objects.
- Job records are deleted after 30 days.
- Workflow execution history is retained for one day after success and seven
  days after an error.
- The configured remote bucket does not yet exist in the currently authenticated
  Cloudflare account, so no deployed lifecycle policy is active there.

The checked-in R2 lifecycle policy expires every `jobs/` object after eight days
as a fail-safe for missed cleanup. Apply it after creating the production bucket
with `pnpm r2:lifecycle`. The application remains the source of truth because R2
lifecycle deletion may run after the exact expiry time.

## Current Data Paths

### Hosted upload

1. The authenticated job endpoint validates headers and streams the raw request
   body directly into `R2Bucket.put()`.
2. D1 records the object key and request identity; R2 retains the object size
   and checksum used during idempotency validation.
3. In production, the Workflow gives providers a short-lived HMAC-scoped URL.
   That endpoint supports `HEAD`, full streaming reads, and single byte ranges.
4. The source object is deleted after the Workflow succeeds or fails.

The app never calls `arrayBuffer()`, `blob()`, or `text()` on production upload
bodies. Local provider trials are the exception because external providers
cannot reach localhost; that fallback is capped at 25 MiB.

### Provider results

Provider SDKs return JavaScript objects, so their upstream JSON response is
already resident in memory. FileRouter does not create another full JSON string:

- JSON encoding emits bounded byte chunks.
- Results under 5 MiB use one known-length R2 write.
- Larger results use exact 5 MiB multipart parts and one smaller final part.
- Failed multipart writes are aborted.
- Comparisons read one stored provider object at a time into the same adaptive
  uploader instead of opening every object or loading results into memory.
- Authenticated result responses are pull-driven, cancel their R2 reader when
  clients disconnect, and use `private, no-store`.

R2 requires all non-final multipart parts to be the same size. A generated
`ReadableStream` is not by itself a valid single-part R2 body because the runtime
does not know its length.

## Why The Hosted Limit Is 100 MB

Cloudflare's inbound request ceiling is account-plan dependent: Free and Pro
accept 100 MB, Business accepts 200 MB, and Enterprise starts at 500 MB. Worker
isolates have 128 MB of memory regardless of plan. Raising an application
constant cannot bypass either boundary.

The existing 100 MB endpoint is therefore the largest portable single-request
surface. Larger files need an upload session, not a larger body limit.

## Future Multipart Upload Sessions

The next upload surface should use the R2 binding rather than exposing R2
credentials or accepting one unbounded presigned PUT:

1. `POST /api/v1/uploads` reserves quota and records expected filename, MIME
   type, byte size, checksum, and expiry in D1.
2. The server creates an R2 multipart upload and returns an opaque upload ID and
   a fixed part size below the Worker request ceiling.
3. The browser or CLI slices the file and sends authenticated numbered parts.
   Each request body streams into `uploadPart()`; all non-final parts have the
   exact configured size.
4. `POST /api/v1/uploads/:id/complete` validates ownership, ordered part ETags,
   total size, and checksum before completing the R2 object and creating the
   document Workflow.
5. Abort and expiry paths release the quota reservation and abort the R2 upload.

This supports resumability and files above 100 MB while retaining FileRouter's
authentication, size enforcement, accounting, and object-key ownership. Uppy
or a small SDK uploader can drive the client protocol later; it should not own
the server-side job model.

## References

- Cloudflare R2 upload methods: https://developers.cloudflare.com/r2/objects/upload-objects/
- R2 Workers binding API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- R2 object lifecycles: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- Workers request and memory limits: https://developers.cloudflare.com/workers/platform/limits/
- Files SDK R2 adapter: `../filerouter-references/files-sdk/packages/files-sdk/src/r2/index.ts`
- Files SDK client upload design: `../filerouter-references/files-sdk/skills/files-sdk/references/client-uploads.md`
- Uppy AWS S3 multipart design: https://uppy.io/docs/aws-s3/
