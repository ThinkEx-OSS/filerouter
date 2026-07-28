import type { ProviderId } from "@file_router/sdk/catalog"

import { signHmac, verifyHmac } from "@/lib/hmac.server"
import { HttpError } from "@/lib/http.server"

const COMPLETION_TOKEN_PURPOSE = "filerouter-provider-completion-v1"
const COMPLETION_URL_TTL_SECONDS = 30 * 60
const TERMINAL_WORKFLOW_STATUSES = new Set([
  "complete",
  "errored",
  "terminated",
])

type CompletionProvider = "datalab" | "llamaparse"

export function providerCompletionEventType(
  provider: ProviderId,
  executionId: string
): string | undefined {
  return isCompletionProvider(provider)
    ? executionCompletionEventType(executionId)
    : undefined
}

export async function withProviderCompletion(
  env: Cloudflare.Env,
  jobId: string,
  executionId: string,
  provider: ProviderId,
  providerOptions: Record<string, unknown> | undefined
): Promise<Record<string, unknown> | undefined> {
  if (!isCompletionProvider(provider)) {
    return providerOptions
  }
  const callbackUrl = await createCallbackUrl(env, jobId, executionId)
  return provider === "datalab"
    ? { ...providerOptions, webhook_url: callbackUrl }
    : {
        ...providerOptions,
        webhook_configurations: [
          {
            webhook_events: [
              "parse.success",
              "parse.error",
              "parse.partial_success",
              "parse.cancelled",
            ],
            webhook_output_format: "json",
            webhook_url: callbackUrl,
          },
        ],
      }
}

export async function receiveProviderCompletion(
  request: Request,
  env: Cloudflare.Env,
  jobId: string,
  executionId: string
): Promise<Response> {
  const url = new URL(request.url)
  const expires = readExpiration(url.searchParams.get("expires"))
  const token = url.searchParams.get("token")
  if (
    !expires ||
    !token ||
    !(await verifyHmac(
      env.BETTER_AUTH_SECRET,
      COMPLETION_TOKEN_PURPOSE,
      tokenPayload(jobId, executionId, expires),
      token
    ))
  ) {
    throw new HttpError(404, "Provider completion not found.", {
      code: "provider_completion_not_found",
    })
  }

  const instance = await env.DOCUMENT_WORKFLOW.get(jobId)
  try {
    await instance.sendEvent({
      payload: {},
      type: executionCompletionEventType(executionId),
    })
  } catch (error) {
    const status = await instance.status().catch(() => undefined)
    if (!status || !TERMINAL_WORKFLOW_STATUSES.has(status.status)) {
      throw error
    }
  }
  return new Response(null, { status: 204 })
}

function isCompletionProvider(value: string): value is CompletionProvider {
  return value === "datalab" || value === "llamaparse"
}

function executionCompletionEventType(executionId: string): string {
  return `provider-${executionId}`
}

async function createCallbackUrl(
  env: Cloudflare.Env,
  jobId: string,
  executionId: string
): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + COMPLETION_URL_TTL_SECONDS
  const token = await signHmac(
    env.BETTER_AUTH_SECRET,
    COMPLETION_TOKEN_PURPOSE,
    tokenPayload(jobId, executionId, expires)
  )
  const url = new URL(
    `/api/v1/provider-completions/${encodeURIComponent(jobId)}/${encodeURIComponent(executionId)}`,
    new URL(env.BETTER_AUTH_URL).origin
  )
  url.searchParams.set("expires", String(expires))
  url.searchParams.set("token", token)
  return url.toString()
}

function tokenPayload(
  jobId: string,
  executionId: string,
  expires: number
): string {
  return `${jobId}\n${executionId}\n${expires}`
}

function readExpiration(value: string | null): number | undefined {
  if (!value || !/^\d{10}$/.test(value)) {
    return undefined
  }
  const expires = Number(value)
  return Number.isSafeInteger(expires) && expires >= Date.now() / 1000
    ? expires
    : undefined
}
