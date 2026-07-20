import { describe, expect, test } from "vite-plus/test"

import {
  builtInProviders,
  DEFAULT_PROVIDER_ID,
  providerIds,
} from "../src/catalog"

describe("built-in provider catalog", () => {
  test("keeps the default and provider order canonical", () => {
    expect(DEFAULT_PROVIDER_ID).toBe(providerIds[0])
    expect(Object.keys(builtInProviders())).toEqual(providerIds)
  })
})
