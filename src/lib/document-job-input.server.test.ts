import { describe, expect, test } from "vite-plus/test"
import {
  HOSTED_JOB_HEADERS,
  MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES,
} from "@file_router/sdk/hosted"

import { readDocumentJobInput } from "@/lib/document-job-input.server"
import { MAX_HOSTED_UPLOAD_BYTES } from "@/lib/document-limits"

describe("document job input", () => {
  test("normalizes hosted URL jobs", async () => {
    const input = await readDocumentJobInput(
      new Request("https://filerouter.test/api/v1/jobs", {
        body: JSON.stringify({
          includeRaw: true,
          operation: "compare",
          outputs: ["markdown", "pages"],
          pages: [1, 3],
          providerOptions: { llamaparse: { tier: "agentic" } },
          providers: ["llamaparse", "mistral-ocr"],
          source: { url: "https://example.com/report.pdf" },
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
    )

    expect(input).toMatchObject({
      includeRaw: true,
      operation: "compare",
      outputs: ["markdown", "pages"],
      pages: [1, 3],
      providerOptions: { llamaparse: { tier: "agentic" } },
      providers: ["llamaparse", "mistral-ocr"],
      source: {
        fileName: "report.pdf",
        kind: "url",
        url: "https://example.com/report.pdf",
      },
    })
  })

  test("rejects private hosted source URLs before creating a job", async () => {
    await expect(
      readDocumentJobInput(
        new Request("https://filerouter.test/api/v1/jobs", {
          body: JSON.stringify({
            operation: "parse",
            outputs: ["markdown"],
            source: { url: "http://169.254.169.254/latest/meta-data" },
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
      )
    ).rejects.toMatchObject({ code: "invalid_source_url", status: 400 })
  })

  test("rejects invalid JSON as a client error", async () => {
    await expect(
      readDocumentJobInput(
        new Request("https://filerouter.test/api/v1/jobs", {
          body: "{",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
      )
    ).rejects.toMatchObject({ status: 400 })
  })

  test("rejects provider-owned transport options for hosted jobs", async () => {
    await expect(
      readDocumentJobInput(
        new Request("https://filerouter.test/api/v1/jobs", {
          body: JSON.stringify({
            operation: "parse",
            outputs: ["markdown"],
            providerOptions: {
              datalab: { webhook_url: "https://example.com/callback" },
            },
            source: { url: "https://example.com/report.pdf" },
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
      )
    ).rejects.toMatchObject({ status: 400 })
  })

  test("keeps hosted LiteParse on curated managed OCR options", async () => {
    const request = (providerOptions: unknown) =>
      readDocumentJobInput(
        new Request("https://filerouter.test/api/v1/jobs", {
          body: JSON.stringify({
            operation: "parse",
            outputs: ["markdown"],
            providerOptions,
            provider: "liteparse",
            source: { url: "https://example.com/report.pdf" },
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
      )

    await expect(
      request({ liteparse: { raw: { ocrServerUrl: "http://localhost" } } })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      request({ liteparse: { inventedOption: true } })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      request({ liteparse: { ocr: "auto", screenshots: true } })
    ).resolves.toMatchObject({
      providerOptions: {
        liteparse: { ocr: "auto", screenshots: true },
      },
    })
  })

  test("passes provider-native options through hosted jobs", async () => {
    const input = await readDocumentJobInput(
      new Request("https://filerouter.test/api/v1/jobs", {
        body: JSON.stringify({
          operation: "parse",
          outputs: ["markdown"],
          providerOptions: {
            datalab: { model_override_settings: '{"temperature":0}' },
          },
          source: { url: "https://example.com/report.pdf" },
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
    )

    expect(input.providerOptions).toEqual({
      datalab: { model_override_settings: '{"temperature":0}' },
    })
  })

  test("infers upload MIME type from its filename", async () => {
    const input = await readDocumentJobInput(
      new Request("https://filerouter.test/api/v1/jobs", {
        body: "document",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-FileRouter-Filename": encodeURIComponent("folder/report.pdf"),
        },
        method: "POST",
      })
    )

    expect(input.source).toMatchObject({
      contentType: "application/pdf",
      fileName: "report.pdf",
      kind: "upload",
    })
  })

  test("keeps JSON documents distinct from JSON job envelopes", async () => {
    const input = await readDocumentJobInput(
      new Request("https://filerouter.test/api/v1/jobs", {
        body: '{"document":true}',
        headers: {
          "Content-Type": "application/octet-stream",
          [HOSTED_JOB_HEADERS.contentType]: "application/json",
          [HOSTED_JOB_HEADERS.fileName]: "document.json",
        },
        method: "POST",
      })
    )

    expect(input.source).toMatchObject({
      contentType: "application/json",
      fileName: "document.json",
      kind: "upload",
    })
  })

  test("rejects uploads above the hosted byte limit before storage", async () => {
    await expect(
      readDocumentJobInput(
        new Request("https://filerouter.test/api/v1/jobs", {
          body: "document",
          headers: {
            "Content-Length": String(MAX_HOSTED_UPLOAD_BYTES + 1),
          },
          method: "POST",
        })
      )
    ).rejects.toMatchObject({ code: "upload_too_large", status: 413 })
  })

  test("rejects oversized provider options headers", async () => {
    await expect(
      readDocumentJobInput(
        new Request("https://filerouter.test/api/v1/jobs", {
          body: "document",
          headers: {
            [HOSTED_JOB_HEADERS.providerOptions]: "x".repeat(
              MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES + 1
            ),
          },
          method: "POST",
        })
      )
    ).rejects.toMatchObject({ status: 400 })
  })
})
