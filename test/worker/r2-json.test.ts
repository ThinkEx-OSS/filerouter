import { env } from "cloudflare:workers"
import { describe, expect, test } from "vite-plus/test"

import { putJson } from "@/lib/r2-json.server"

describe("R2 JSON storage", () => {
  test("stores JSON spanning multiple full multipart parts", async () => {
    const key = `tests/${crypto.randomUUID()}.json`
    const value = { content: "x".repeat(10 * 1024 * 1024) }

    try {
      await putJson(env.FILEROUTER_FILES, key, value)
      const stored = await env.FILEROUTER_FILES.get(key)

      expect(stored?.httpMetadata?.contentType).toBe("application/json")
      await expect(stored?.json()).resolves.toEqual(value)
    } finally {
      await env.FILEROUTER_FILES.delete(key)
    }
  })
})
