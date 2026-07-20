# Document Inputs

FileRouter separates three concerns that should not be collapsed into one
generic file pipeline.

## Input Transport

The public SDK accepts HTTP URLs, local paths, `File`, `Blob`, `ArrayBuffer`,
typed-array views, and web `ReadableStream` values. The router resolves an input
once into one of two provider-safe forms:

- a validated HTTP URL;
- replayable bytes with a normalized filename and MIME type.

This is especially important for `compare()`: one-shot streams must be consumed
once before multiple providers run concurrently.

MIME resolution is deterministic:

1. use a valid, explicit, non-generic MIME type;
2. infer from the filename extension;
3. fall back to `application/octet-stream`.

MIME metadata never selects a provider or changes the requested operation.

## Inspection And Validation

`@file_router/sdk/inspect` provides opt-in signature inspection through
`file-type`.
It reports the resolved type, extension-derived type, detected binary type, and
whether the resolved type conflicts with the bytes. URL inspection never
downloads the URL implicitly.

The core router does not reject a file merely because its signature is unknown.
Text formats such as CSV and Markdown do not have reliable binary signatures,
and provider support changes independently of FileRouter releases. Hosted
policies may later choose to reject known mismatches, cap byte sizes, or allow
specific MIME groups before dispatch.

## Operations And Conversion

Transport metadata is not user intent. `parse()` and `compare()` are explicit
operations. Future contracts such as `extract(schema)`, `classify(labels)`, and
`split(strategy)` should be separate typed methods rather than values in a loose
`intent` field.

FileRouter should send original documents to providers whenever possible.
Automatic conversion before provider dispatch would erase provider-native
layout, OCR, and Office-document capabilities. Conversion belongs in an
explicit compatibility step with provenance when a selected provider cannot
accept the original format; it should not be a hidden default.

## Large Hosted Uploads

The hosted endpoint accepts up to 100 MB, matching the request-body ceiling on
Cloudflare Free and Pro plans. The request body streams directly into R2; it is
never parsed as multipart or buffered by FileRouter during ingress.

In production, a workflow gives each provider a short-lived, HMAC-scoped source
URL. The source endpoint streams the R2 body and is deleted after processing,
so comparisons do not load one full document copy per provider into the Worker
isolate. Localhost cannot be fetched by external providers, so local hosted
trials retain a 25 MiB buffered fallback. Use a public development tunnel when
testing larger hosted uploads locally.

Files above 100 MB should use a future direct-to-R2 upload session with size and
checksum verification. That avoids Cloudflare's HTTP request-body ceiling and
supports multipart upload without changing the parsing contract.

Provider responses are a separate memory boundary. Upstream SDKs currently
decode complete JSON responses, so image-heavy and provider-native JSON output
can still be large. Normalized data has one canonical location under
`result.outputs`, and complete provider responses are only retained when
`includeRaw` is explicitly enabled.

## Provider Boundaries

Provider capabilities should describe behavior FileRouter can enforce, while
provider-specific limits and format gaps remain documented adapter facts. Every
adapter keeps its typed native options and raw client escape hatch. Unsupported
normalized outputs fail before provider I/O instead of silently degrading.
