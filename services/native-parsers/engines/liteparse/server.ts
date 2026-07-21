import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { extname, join } from "node:path"

import LiteParse from "@llamaindex/liteparse"
import type {
  ImageMode,
  LiteParseConfig,
  ParseResult,
} from "@llamaindex/liteparse"

import runtimePackage from "./package.json" with { type: "json" }

import type { NativeParserResult } from "../shared/contracts.ts"
import { ParserRequestError, startParserServer } from "../shared/http.ts"
import {
  assertAllowedKeys,
  invalidOptions,
  readNativeParserOptions,
  readObject,
  readOptionalBoolean,
} from "../shared/options.ts"

const ENGINE_VERSION = runtimePackage.dependencies["@llamaindex/liteparse"]
const MAX_INPUT_BYTES = 100 * 1024 * 1024
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
const MAX_PAGES = 500
const OFFICE_EXTENSIONS = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".odp",
  ".ods",
  ".odt",
  ".ppt",
  ".pptx",
  ".rtf",
  ".tsv",
  ".xls",
  ".xlsx",
])

type LiteParseHostedOptions = {
  convertOffice?: boolean
  imageMode?: ImageMode
  includeComplexity?: boolean
  ocr?: "auto" | "off"
  ocrLanguage?: string
  raw?: Partial<
    Pick<
      LiteParseConfig,
      | "cropBox"
      | "dpi"
      | "emitWordBoxes"
      | "extractLinks"
      | "ocrFailureFatal"
      | "preserveVerySmallText"
      | "quiet"
      | "skipDiagonalText"
    >
  >
  screenshots?: boolean
}

startParserServer({
  handler: ({ bytes, contentType, fileName, options }) =>
    parseDocument(bytes, contentType, fileName, options),
  maxBytes: MAX_INPUT_BYTES,
  maxConcurrency: 1,
  maxResponseBytes: MAX_OUTPUT_BYTES,
  parserId: "liteparse",
})

async function parseDocument(
  bytes: Buffer,
  contentType: string,
  fileName: string,
  value: unknown
): Promise<NativeParserResult> {
  const request = readNativeParserOptions(value)
  const providerOptions = readProviderOptions(request.providerOptions)
  const pages = request.pages
  if (pages?.some((page) => page > MAX_PAGES)) {
    throw new ParserRequestError(
      413,
      "provider_limit_exceeded",
      `LiteParse supports pages up to ${MAX_PAGES}.`
    )
  }
  const parser = new LiteParse({
    ...providerOptions.raw,
    imageMode: providerOptions.imageMode ?? "placeholder",
    includeComplexity: providerOptions.includeComplexity ?? true,
    maxPages: MAX_PAGES,
    ocrEnabled: providerOptions.ocr !== "off",
    ocrLanguage: providerOptions.ocrLanguage ?? "eng",
    outputFormat: "markdown",
    ...(pages && { targetPages: pages.join(",") }),
  })
  const source = await prepareSource(
    bytes,
    contentType,
    fileName,
    providerOptions.convertOffice === true
  )

  try {
    const result = await parser.parse(source.input)
    const screenshots = providerOptions.screenshots
      ? await parser.screenshot(source.input, pages)
      : []
    return normalizeResult(result, screenshots, parser.getConfig())
  } finally {
    await source.cleanup()
  }
}

function normalizeResult(
  result: ParseResult,
  screenshots: Awaited<ReturnType<LiteParse["screenshot"]>>,
  config: LiteParseConfig
): NativeParserResult {
  const pages = result.pages.map((page) => ({
    dimensions: { height: page.height, width: page.width },
    markdown: page.markdown,
    metadata: {
      ...(page.complexity && { complexity: page.complexity }),
      textItems: page.textItems,
    },
    pageNumber: page.pageNum,
    text: page.text,
  }))
  const warnings = result.pages.flatMap((page) =>
    page.complexity?.needsOcr && !config.ocrEnabled
      ? [
          {
            code: "ocr_required",
            message: `Page requires OCR: ${page.complexity.reasons.join(", ")}.`,
            pageNumber: page.pageNum,
          },
        ]
      : []
  )
  const embeddedImages = result.images.map((image) => ({
    data: image.bytes.toString("base64"),
    id: image.id,
    mimeType: image.format.includes("/")
      ? image.format
      : `image/${image.format}`,
    pageNumber: image.page,
  }))
  const screenshotImages = screenshots.map((image) => ({
    data: image.imageBuffer.toString("base64"),
    id: `screenshot-${image.pageNum}`,
    mimeType: "image/png",
    pageNumber: image.pageNum,
  }))

  return {
    engine: { id: "liteparse", version: ENGINE_VERSION },
    ...(embeddedImages.length > 0 || screenshotImages.length > 0
      ? { images: [...embeddedImages, ...screenshotImages] }
      : {}),
    markdown: pages.map((page) => page.markdown).join("\n\n"),
    metadata: {
      imageMode: config.imageMode,
      ocrEnabled: config.ocrEnabled,
      ocrLanguage: config.ocrLanguage,
    },
    pageCount: pages.length,
    pages,
    text: result.text,
    warnings,
  }
}

async function prepareSource(
  bytes: Buffer,
  contentType: string,
  fileName: string,
  convertOffice: boolean
): Promise<{ cleanup: () => Promise<void>; input: Buffer | string }> {
  const extension = extname(fileName).toLowerCase()
  const isPdf = contentType === "application/pdf" || extension === ".pdf"
  if (isPdf) {
    return { cleanup: async () => undefined, input: bytes }
  }
  if (!convertOffice || !OFFICE_EXTENSIONS.has(extension)) {
    throw new ParserRequestError(
      400,
      "unsupported_document_type",
      "Non-PDF documents require convertOffice: true and a supported Office format."
    )
  }

  const directory = await mkdtemp(join(tmpdir(), "filerouter-liteparse-"))
  const input = join(directory, `document${extension}`)
  await writeFile(input, bytes)
  return {
    cleanup: () => rm(directory, { force: true, recursive: true }),
    input,
  }
}

function readProviderOptions(value: unknown): LiteParseHostedOptions {
  if (value === undefined) {
    return {}
  }
  const options = readObject(value)
  assertAllowedKeys(options, [
    "convertOffice",
    "imageMode",
    "includeComplexity",
    "ocr",
    "ocrLanguage",
    "raw",
    "screenshots",
  ])
  const convertOffice = readOptionalBoolean(
    options.convertOffice,
    "convertOffice"
  )
  const includeComplexity = readOptionalBoolean(
    options.includeComplexity,
    "includeComplexity"
  )
  const screenshots = readOptionalBoolean(options.screenshots, "screenshots")
  const imageMode = readImageMode(options.imageMode)
  const ocr = readOcrMode(options.ocr)
  const ocrLanguage = readOcrLanguage(options.ocrLanguage)
  const raw = readRawOptions(options.raw)
  return {
    ...(convertOffice !== undefined && { convertOffice }),
    ...(imageMode && { imageMode }),
    ...(includeComplexity !== undefined && { includeComplexity }),
    ...(ocr && { ocr }),
    ...(ocrLanguage && { ocrLanguage }),
    ...(raw && { raw }),
    ...(screenshots !== undefined && { screenshots }),
  }
}

function readImageMode(value: unknown): ImageMode | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === "embed" || value === "off" || value === "placeholder") {
    return value
  }
  throw invalidOptions("imageMode is invalid.")
}

function readOcrMode(value: unknown): "auto" | "off" | undefined {
  if (value === undefined || value === "auto" || value === "off") {
    return value
  }
  throw invalidOptions("ocr must be auto or off.")
}

function readOcrLanguage(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === "eng") {
    return "eng"
  }
  throw invalidOptions("ocrLanguage must be eng.")
}

function readRawOptions(value: unknown): LiteParseHostedOptions["raw"] {
  if (value === undefined) {
    return undefined
  }
  const raw = readObject(value)
  assertAllowedKeys(raw, [
    "cropBox",
    "dpi",
    "emitWordBoxes",
    "extractLinks",
    "ocrFailureFatal",
    "preserveVerySmallText",
    "quiet",
    "skipDiagonalText",
  ])
  const emitWordBoxes = readOptionalBoolean(
    raw.emitWordBoxes,
    "raw.emitWordBoxes"
  )
  const extractLinks = readOptionalBoolean(raw.extractLinks, "raw.extractLinks")
  const ocrFailureFatal = readOptionalBoolean(
    raw.ocrFailureFatal,
    "raw.ocrFailureFatal"
  )
  const preserveVerySmallText = readOptionalBoolean(
    raw.preserveVerySmallText,
    "raw.preserveVerySmallText"
  )
  const quiet = readOptionalBoolean(raw.quiet, "raw.quiet")
  const skipDiagonalText = readOptionalBoolean(
    raw.skipDiagonalText,
    "raw.skipDiagonalText"
  )
  const dpi = readPositiveNumber(raw.dpi, "raw.dpi")
  const cropBox = readCropBox(raw.cropBox)
  return {
    ...(cropBox && { cropBox }),
    ...(dpi !== undefined && { dpi }),
    ...(emitWordBoxes !== undefined && { emitWordBoxes }),
    ...(extractLinks !== undefined && { extractLinks }),
    ...(ocrFailureFatal !== undefined && { ocrFailureFatal }),
    ...(preserveVerySmallText !== undefined && { preserveVerySmallText }),
    ...(quiet !== undefined && { quiet }),
    ...(skipDiagonalText !== undefined && { skipDiagonalText }),
  }
}

function readPositiveNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value
  }
  throw invalidOptions(`${name} must be a positive number.`)
}

function readCropBox(value: unknown): LiteParseConfig["cropBox"] | undefined {
  if (value === undefined) {
    return undefined
  }
  const cropBox = readObject(value, "raw.cropBox must be an object.")
  assertAllowedKeys(cropBox, ["bottom", "left", "right", "top"])
  const bottom = readFiniteNumber(cropBox.bottom, "raw.cropBox.bottom")
  const left = readFiniteNumber(cropBox.left, "raw.cropBox.left")
  const right = readFiniteNumber(cropBox.right, "raw.cropBox.right")
  const top = readFiniteNumber(cropBox.top, "raw.cropBox.top")
  return { bottom, left, right, top }
}

function readFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidOptions(`${name} must be a finite number.`)
  }
  return value
}
