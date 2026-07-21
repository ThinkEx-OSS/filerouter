import type { NativeParserOptions } from "./contracts.ts"
import { ParserRequestError } from "./http.ts"

export function readNativeParserOptions(value: unknown): NativeParserOptions {
  const options = readObject(value, "Parser options must be an object.")
  assertAllowedKeys(options, ["pages", "providerOptions"])
  const pages = readPages(options.pages)
  return {
    ...(pages && { pages }),
    ...(options.providerOptions !== undefined && {
      providerOptions: options.providerOptions,
    }),
  }
}

export function readObject(
  value: unknown,
  message = "Provider options must be an object."
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidOptions(message)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlyArray<string>
): void {
  const allowedKeys = new Set(allowed)
  const unsupported = Object.keys(value).filter((key) => !allowedKeys.has(key))
  if (unsupported.length > 0) {
    throw invalidOptions(`Unsupported options: ${unsupported.join(", ")}.`)
  }
}

export function readOptionalBoolean(
  value: unknown,
  name: string
): boolean | undefined {
  if (value === undefined || typeof value === "boolean") {
    return value
  }
  throw invalidOptions(`${name} must be a boolean.`)
}

function readPages(value: unknown): Array<number> | undefined {
  if (value === undefined) {
    return undefined
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((page) => !Number.isSafeInteger(page) || page < 1)
  ) {
    throw new ParserRequestError(
      400,
      "invalid_pages",
      "Pages must be positive, one-based integers."
    )
  }
  return [
    ...new Set(
      value.filter((page): page is number => typeof page === "number")
    ),
  ]
}

export function invalidOptions(message: string): ParserRequestError {
  return new ParserRequestError(400, "invalid_provider_options", message)
}
