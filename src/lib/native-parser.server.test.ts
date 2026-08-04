import { describe, expect, test, vi } from "vite-plus/test"

import { createNativeParserProvider } from "@/lib/native-parser.server"

const nativeResult = {
  engine: { id: "liteparse", version: "2.10.1" },
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
      pageFields: ["dimensions", "markdown", "metadata", "text"],
    },
    fetch,
    id: "liteparse",
    name: "LiteParse",
  })
}

function anydocProvider(fetch: (request: Request) => Promise<Response>) {
  return createNativeParserProvider({
    capabilities: {
      execution: "sync",
      features: ["classification", "office-conversion"],
      outputs: ["markdown", "metadata"],
    },
    fetch,
    id: "anydoc",
    name: "Anydoc",
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
        outputs: ["markdown", "metadata", "pages"],
        pageFields: ["markdown"],
        providerOptions: { liteparse: { ocr: "auto" } },
      }
    )

    const engineOptions = JSON.parse(
      decodeURIComponent(
        requests[0]?.headers.get("x-filerouter-engine-options") ?? ""
      )
    )
    expect(engineOptions).toEqual({
      outputs: ["markdown", "metadata", "pages"],
      pageFields: ["markdown"],
      providerOptions: { ocr: "auto" },
    })
    expect(requests[0]?.headers.get("x-filerouter-source-url")).toContain(
      "/api/v1/sources/job/report.pdf"
    )
    expect(result).toMatchObject({
      outputs: {
        markdown: "# Parsed",
        metadata: {
          engine: { id: "liteparse", version: "2.10.1" },
          ocrEnabled: true,
        },
        pages: [
          {
            markdown: "# Parsed",
            pageNumber: 1,
            text: "Parsed",
            warnings: [],
          },
        ],
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

  test("normalizes non-paginated anydoc results", async () => {
    const provider = anydocProvider(async () =>
      Response.json({
        engine: { id: "anydoc", version: "0.1.1" },
        markdown: "# Parsed Office document",
        metadata: { format: "docx", paginated: false },
        pageCount: 0,
        pages: [],
        warnings: [],
      })
    )

    await expect(
      provider.parse(
        {
          kind: "url",
          url: "https://filerouter.dev/api/v1/sources/job/report.docx?expires=1&token=x",
        },
        { outputs: ["markdown", "metadata"] }
      )
    ).resolves.toMatchObject({
      outputs: {
        markdown: "# Parsed Office document",
        metadata: {
          engine: { id: "anydoc", version: "0.1.1" },
          format: "docx",
          paginated: false,
        },
      },
      pageCount: 0,
      provider: "anydoc",
      usage: { pages: 0 },
    })
  })
})
