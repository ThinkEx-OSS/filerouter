import { describe, expect, test, vi } from "vite-plus/test"

import { createNativeParserProvider } from "@/lib/native-parser.server"

const nativeResult = {
  engine: { id: "liteparse", version: "2.8.0" },
  markdown: "# Parsed",
  metadata: { ocrEnabled: true },
  pageCount: 1,
  pages: [{ markdown: "# Parsed", pageNumber: 1, text: "Parsed" }],
  text: "Parsed",
  warnings: [],
}

function liteParseProvider(fetch: (request: Request) => Promise<Response>) {
  return createNativeParserProvider({
    capabilities: {
      execution: "sync",
      outputs: ["markdown", "metadata", "pages", "text"],
    },
    fetch,
    id: "liteparse",
    name: "LiteParse",
  })
}

describe("hosted native parser transport", () => {
  test("passes signed document URLs to the private parser service", async () => {
    const requests: Array<Request> = []
    const fetch = vi.fn(async (request: Request) => {
      requests.push(request)
      return Response.json(nativeResult)
    })
    const provider = liteParseProvider(fetch)

    const result = await provider.parse(
      {
        kind: "url",
        url: "https://filerouter.dev/api/v1/sources/job/report.pdf?expires=1&token=x",
      },
      {
        outputs: ["markdown", "metadata"],
        providerOptions: { liteparse: { ocr: "auto" } },
      }
    )

    expect(requests[0]?.headers.get("x-filerouter-source-url")).toContain(
      "/api/v1/sources/job/report.pdf"
    )
    expect(result).toMatchObject({
      outputs: {
        markdown: "# Parsed",
        metadata: {
          engine: { id: "liteparse", version: "2.8.0" },
          ocrEnabled: true,
        },
      },
      pageCount: 1,
      provider: "liteparse",
      usage: { pages: 1 },
    })
  })

  test("rejects malformed private parser responses", async () => {
    const provider = liteParseProvider(async () =>
      Response.json({ pageCount: 1 })
    )

    await expect(
      provider.parse(
        {
          kind: "url",
          url: "https://filerouter.dev/api/v1/sources/job/report.pdf?expires=1&token=x",
        },
        { outputs: ["markdown"] }
      )
    ).rejects.toMatchObject({ code: "ParseFailed" })
  })
})
