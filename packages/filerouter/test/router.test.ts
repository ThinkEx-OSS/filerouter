import { describe, expect, test } from "vite-plus/test"

import {
  FileRouter,
  FileRouterError,
  serializeProviderError,
} from "../src/index"
import { fakeProvider } from "../src/testing"

describe("FileRouter", () => {
  test("parses with the configured provider", async () => {
    const router = new FileRouter({
      providers: {
        fake: fakeProvider(),
      },
    })

    const result = await router.parse(new Blob(["document"]), {
      outputs: ["markdown", "pages"],
    })

    expect(result.provider).toBe("fake")
    expect(result.outputs.markdown).toContain("Fake document")
    expect(result.outputs.pages).toHaveLength(1)
  })

  test("selects a provider by id", async () => {
    const router = new FileRouter({
      defaultProvider: "one",
      providers: {
        one: fakeProvider({ id: "one" }),
        two: fakeProvider({ id: "two" }),
      },
    })

    const result = await router.parse(new Blob(["document"]), {
      provider: "two",
    })

    expect(result.provider).toBe("two")
  })

  test("throws when a provider is missing", async () => {
    const router = new FileRouter({
      providers: {
        fake: fakeProvider(),
      },
    })

    await expect(
      router.parse("sample.pdf", {
        provider: "missing",
      })
    ).rejects.toMatchObject({
      code: "ProviderNotFound",
    })
  })

  test("throws when a provider does not support a requested output", async () => {
    const router = new FileRouter({
      providers: {
        fake: {
          ...fakeProvider(),
          capabilities: {
            execution: "sync",
            outputs: ["text"],
          },
        },
      },
    })

    await expect(
      router.parse("sample.pdf", {
        outputs: ["markdown"],
      })
    ).rejects.toBeInstanceOf(FileRouterError)
  })

  test("rejects zero-based page indices", async () => {
    const router = new FileRouter({ providers: { fake: fakeProvider() } })

    await expect(router.parse("sample.pdf", { pages: [0] })).rejects.toThrow(
      "Pages must be positive, one-based integers."
    )
  })

  test("serializes FileRouter errors from another package copy", () => {
    const error = Object.assign(new Error("rate limited"), {
      code: "RateLimit",
      [Symbol.for("file_router.error.FileRouterError")]: true,
    })

    expect(serializeProviderError(error)).toEqual({
      code: "RateLimit",
      message: "rate limited",
    })
  })
})
