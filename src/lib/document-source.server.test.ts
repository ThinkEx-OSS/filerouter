import { describe, expect, test } from "vite-plus/test"

import { canProvidersReachSourceUrl } from "@/lib/document-source.server"

describe("provider document sources", () => {
  test("distinguishes public origins from local development", () => {
    expect(canProvidersReachSourceUrl("https://filerouter.dev")).toBe(true)
    expect(canProvidersReachSourceUrl("http://localhost:3000")).toBe(false)
    expect(canProvidersReachSourceUrl("http://192.168.1.10:3000")).toBe(false)
  })
})
