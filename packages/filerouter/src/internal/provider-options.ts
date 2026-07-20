import { FileRouterError } from "../errors"
import type { ParseOptions } from "../types"

export function providerOptions<T>(
  options: ParseOptions,
  providerId: string
): T {
  const value = options.providerOptions?.[providerId]
  if (value === undefined) {
    return {} as T
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FileRouterError(
      `Provider options for "${providerId}" must be an object.`,
      { code: "ParseFailed", providerId }
    )
  }
  return value as T
}

export function assertPages(pages: Array<number> | undefined): void {
  if (pages?.some((page) => !Number.isSafeInteger(page) || page < 1)) {
    throw new FileRouterError("Pages must be positive, one-based integers.", {
      code: "ParseFailed",
    })
  }
}
