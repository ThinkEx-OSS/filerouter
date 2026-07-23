import { describe, expect, test } from "vite-plus/test"

import { DirectFileRouter } from "../src/index"
import { fakeProvider } from "../src/testing"
import type { ProviderInput } from "../src/types"

describe("compare", () => {
  test("compares all configured providers", async () => {
    const router = new DirectFileRouter({
      providers: {
        one: fakeProvider({ id: "one" }),
        two: fakeProvider({ id: "two" }),
      },
    })

    const result = await router.compare(new Blob(["document"]), {
      outputs: ["markdown", "pages"],
    })

    expect(result.providers).toHaveLength(2)
    expect(result.providers.map((provider) => provider.status)).toEqual([
      "parsed",
      "parsed",
    ])
  })

  test("returns unsupported provider rows without failing the full comparison", async () => {
    const router = new DirectFileRouter({
      providers: {
        textOnly: {
          ...fakeProvider({ id: "textOnly" }),
          capabilities: {
            execution: "sync",
            outputs: ["text"],
          },
        },
      },
    })

    const result = await router.compare(new Blob(["document"]), {
      outputs: ["markdown"],
    })

    expect(result.providers[0]).toMatchObject({
      provider: "textOnly",
      status: "unsupported",
    })
  })

  test("resolves a one-shot stream once for every provider", async () => {
    const inputs: Array<ProviderInput> = []
    const captureProvider = (id: string) => {
      const provider = fakeProvider({ id })
      return {
        ...provider,
        parse: async (
          input: ProviderInput,
          options: Parameters<typeof provider.parse>[1]
        ) => {
          inputs.push(input)
          return provider.parse(input, options)
        },
      }
    }
    const router = new DirectFileRouter({
      providers: {
        one: captureProvider("one"),
        two: captureProvider("two"),
      },
    })
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("document"))
        controller.close()
      },
    })

    await router.compare(input)

    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toBe(inputs[1])
    expect(inputs[0]).toMatchObject({
      kind: "bytes",
      mimeType: "application/octet-stream",
      name: "document",
    })
  })
})
