import { builtInProviders } from "@file_router/sdk/catalog"
import type { ProviderId } from "@file_router/sdk/catalog"
import type { FileRouterProvider, ProviderParseOptions } from "@file_router/sdk"

import { HttpError } from "@/lib/http.server"
import { createNativeParserProvider } from "@/lib/native-parser.server"
import { isRecord } from "@/lib/record"
import { JOB_ID_HEADER, REQUEST_ID_HEADER } from "@/observability/log"

const blockedTransportOptions: Record<ProviderId, ReadonlySet<string>> = {
  datalab: new Set([
    "checkpoint_id",
    "eval_rubric_id",
    "file",
    "file_url",
    "webhook_url",
    "workflowstepdata_id",
  ]),
  llamaparse: new Set([
    "configuration_id",
    "file_id",
    "http_proxy",
    "organization_id",
    "project_id",
    "source_url",
    "upload_file",
    "webhook_configuration_ids",
    "webhook_configurations",
  ]),
  liteparse: new Set(),
  "mistral-ocr": new Set(["document"]),
  "pdf-inspector": new Set(),
}

const liteParseOptions = new Set([
  "convertOffice",
  "imageMode",
  "includeComplexity",
  "ocr",
  "ocrLanguage",
  "raw",
  "screenshots",
])

const liteParseRawOptions = new Set([
  "cropBox",
  "dpi",
  "emitWordBoxes",
  "extractLinks",
  "ocrFailureFatal",
  "preserveVerySmallText",
  "quiet",
  "skipDiagonalText",
])

const liteParseCropBoxOptions = new Set(["bottom", "left", "right", "top"])
const MAX_LITEPARSE_DPI = 300
const HOSTED_MISTRAL_OCR_MODELS = new Set([
  "mistral-ocr-2512",
  "mistral-ocr-4-0",
  "mistral-ocr-latest",
])

const validateProviderOptions: Record<
  ProviderId,
  (options: Record<string, unknown>) => void
> = {
  datalab(options) {
    assertNoBlockedOptions("datalab", options)
    if (isRecord(options.raw)) {
      assertNoBlockedOptions("datalab", options.raw)
    }
  },
  llamaparse: (options) => assertNoBlockedOptions("llamaparse", options),
  liteparse(options) {
    assertOnlyOptions("liteparse", options, liteParseOptions)
    validateLiteParseRawOptions(options.raw)
  },
  "mistral-ocr"(options) {
    assertNoBlockedOptions("mistral-ocr", options)
    if (
      options.model !== undefined &&
      (typeof options.model !== "string" ||
        !HOSTED_MISTRAL_OCR_MODELS.has(options.model))
    ) {
      throw new HttpError(
        400,
        "Hosted mistral-ocr only accepts models on the published rate card."
      )
    }
  },
  "pdf-inspector"(options) {
    if (Object.keys(options).length > 0) {
      throw new HttpError(400, "Hosted pdf-inspector accepts no options.")
    }
  },
}

function validateLiteParseRawOptions(value: unknown): void {
  if (value === undefined) {
    return
  }
  if (!isRecord(value)) {
    throw new HttpError(400, "Hosted liteparse raw options must be an object.")
  }
  assertOnlyOptions("liteparse", value, liteParseRawOptions)

  if (
    value.dpi !== undefined &&
    (typeof value.dpi !== "number" ||
      !Number.isFinite(value.dpi) ||
      value.dpi <= 0 ||
      value.dpi > MAX_LITEPARSE_DPI)
  ) {
    throw new HttpError(
      400,
      `Hosted liteparse dpi must be greater than 0 and at most ${MAX_LITEPARSE_DPI}.`
    )
  }

  if (value.cropBox === undefined) {
    return
  }
  if (!isRecord(value.cropBox)) {
    throw new HttpError(400, "Hosted liteparse cropBox must be an object.")
  }
  assertOnlyOptions("liteparse", value.cropBox, liteParseCropBoxOptions)
  for (const side of liteParseCropBoxOptions) {
    const fraction = value.cropBox[side]
    if (
      typeof fraction !== "number" ||
      !Number.isFinite(fraction) ||
      fraction < 0 ||
      fraction > 1
    ) {
      throw new HttpError(
        400,
        `Hosted liteparse cropBox.${side} must be between 0 and 1.`
      )
    }
  }
}

export function createHostedProviders(
  env: Cloudflare.Env,
  context: { jobId: string; requestId: string }
): Record<ProviderId, FileRouterProvider> {
  const managed = builtInProviders({
    datalabApiKey: env.DATALAB_API_KEY,
    llamaCloudApiKey: env.LLAMA_CLOUD_API_KEY,
    mistralApiKey: env.MISTRAL_API_KEY,
  })
  const nativeFetch = (request: Request) => {
    const headers = new Headers(request.headers)
    headers.set(JOB_ID_HEADER, context.jobId)
    headers.set(REQUEST_ID_HEADER, context.requestId)
    return env.NATIVE_PARSERS.fetch(new Request(request, { headers }))
  }
  return {
    ...managed,
    liteparse: createNativeParserProvider({
      capabilities: {
        execution: "sync",
        features: [
          "classification",
          "ocr",
          "office-conversion",
          "page-selection",
          "screenshots",
        ],
        outputs: ["images", "markdown", "metadata", "pages", "text"],
      },
      fetch: nativeFetch,
      id: "liteparse",
      name: "LiteParse",
    }),
    "pdf-inspector": createNativeParserProvider({
      capabilities: {
        execution: "sync",
        features: ["classification", "page-selection"],
        outputs: ["markdown", "metadata", "pages"],
      },
      fetch: nativeFetch,
      id: "pdf-inspector",
      name: "PDF Inspector",
    }),
  }
}

export function validateHostedProviderOptions(
  value: unknown,
  isProviderId: (value: string) => value is ProviderId
): ProviderParseOptions {
  if (!isRecord(value)) {
    throw new HttpError(400, "Provider options must be an object.")
  }

  for (const [providerId, options] of Object.entries(value)) {
    if (!isProviderId(providerId)) {
      throw new HttpError(400, `Unsupported provider options: ${providerId}`)
    }
    if (!isRecord(options)) {
      throw new HttpError(
        400,
        `Provider options for ${providerId} must be an object.`
      )
    }
    validateProviderOptions[providerId](options)
  }

  return value
}

function assertOnlyOptions(
  providerId: ProviderId,
  options: Record<string, unknown>,
  allowedOptions: ReadonlySet<string>
): void {
  const unsupported = Object.keys(options).filter(
    (key) => !allowedOptions.has(key)
  )
  if (unsupported.length > 0) {
    throw new HttpError(
      400,
      `Hosted ${providerId} options do not support: ${unsupported.join(", ")}.`
    )
  }
}

function assertNoBlockedOptions(
  providerId: ProviderId,
  options: Record<string, unknown>
): void {
  const blockedOptions = blockedTransportOptions[providerId]
  const blocked = Object.keys(options).filter((key) => blockedOptions.has(key))
  if (blocked.length > 0) {
    throw new HttpError(
      400,
      `Hosted ${providerId} options cannot set: ${blocked.join(", ")}.`
    )
  }
}
