import { describe, expect, test } from "vite-plus/test"

import { jsonReadableStream } from "@/lib/json-stream.server"

describe("jsonReadableStream", () => {
  test("matches JSON.stringify for nested provider results", async () => {
    const value = {
      outputs: {
        markdown: `quote: " slash: \\ newline:\n emoji: 🚀 lone: \ud800`,
        pages: [{ pageNumber: 1, skipped: undefined }],
      },
      usage: { cost: Number.NaN },
    }

    expect(await new Response(jsonReadableStream(value)).text()).toBe(
      JSON.stringify(value)
    )
  })

  test("rejects circular results", async () => {
    const value: Record<string, unknown> = {}
    value.self = value

    await expect(
      new Response(jsonReadableStream(value)).text()
    ).rejects.toThrow("circular structure")
  })
})
