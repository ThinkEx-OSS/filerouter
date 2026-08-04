import { describe, expect, test } from "vite-plus/test"

import { parseAnydoc } from "../engines/anydoc/parse.ts"

const bytes = (value: string) => new TextEncoder().encode(value)

describe("anydoc parser", () => {
  test("converts named CSV bytes to non-paginated markdown", async () => {
    await expect(
      parseAnydoc(
        bytes("name,score\nAda,10\nGrace,9\n"),
        "scores.csv",
        { outputs: ["markdown", "metadata"] },
        "test"
      )
    ).resolves.toMatchObject({
      engine: { id: "anydoc", version: "test" },
      markdown: expect.stringContaining("Ada"),
      metadata: { format: "csv", paginated: false },
      pageCount: 0,
      pages: [],
      warnings: [],
    })
  })

  test("rejects page selection", async () => {
    await expect(
      parseAnydoc(bytes("a,b\n1,2\n"), "table.csv", { pages: [1] }, "test")
    ).rejects.toMatchObject({ code: "unsupported_pages", status: 400 })
  })

  test("rejects provider options", async () => {
    await expect(
      parseAnydoc(
        bytes("a,b\n1,2\n"),
        "table.csv",
        { providerOptions: { mode: "fast" } },
        "test"
      )
    ).rejects.toMatchObject({ code: "invalid_provider_options", status: 400 })
  })
})
