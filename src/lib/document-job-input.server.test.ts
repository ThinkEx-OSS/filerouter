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
