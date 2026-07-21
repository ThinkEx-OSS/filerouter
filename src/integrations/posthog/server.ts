import { PostHog } from "posthog-node/edge"

import {
  getPostHogConfig,
  type PostHogEnv,
} from "@/integrations/posthog/config"
import {
  emitWideEvent,
  serializeError,
  type ObservabilityEnv,
} from "@/observability/log"

type ServerTelemetryEnv = PostHogEnv & ObservabilityEnv

const DISTINCT_ID_HEADER = "x-posthog-distinct-id"
const SESSION_ID_HEADER = "x-posthog-session-id"
const WINDOW_ID_HEADER = "x-posthog-window-id"

type ServerTelemetry = {
  distinctId: string
  properties?: Record<string, unknown>
} & (
  | { event: string; exception?: unknown }
  | { event?: string; exception: unknown }
)

export function captureServerTelemetry(
  env: ServerTelemetryEnv,
  telemetry: ServerTelemetry
): Promise<void> {
  const config = getPostHogConfig(env)
  if (!config) {
    return Promise.resolve()
  }

  return deliver(env, config, telemetry)
}

export function postHogDistinctId(request: Request, fallback: string): string {
  return request.headers.get(DISTINCT_ID_HEADER) ?? fallback
}

export function postHogTraceProperties(
  request: Request
): Record<string, string> {
  return Object.fromEntries(
    [
      ["$session_id", request.headers.get(SESSION_ID_HEADER)],
      ["$window_id", request.headers.get(WINDOW_ID_HEADER)],
    ].filter((entry): entry is [string, string] => Boolean(entry[1]))
  )
}

async function deliver(
  env: ServerTelemetryEnv,
  config: NonNullable<ReturnType<typeof getPostHogConfig>>,
  telemetry: ServerTelemetry
): Promise<void> {
  const client = new PostHog(config.token, {
    flushAt: 1,
    flushInterval: 0,
    host: config.host,
  })
  try {
    if (telemetry.event) {
      await client.captureImmediate({
        distinctId: telemetry.distinctId,
        event: telemetry.event,
        properties: telemetry.properties,
      })
    }
    if (telemetry.exception !== undefined) {
      client.captureException(
        telemetry.exception,
        telemetry.distinctId,
        telemetry.properties
      )
    }
    await client.shutdown()
  } catch (error) {
    emitWideEvent(env, "error", {
      attempted_event: telemetry.event ?? "$exception",
      event: "telemetry_delivery_failed",
      job_id: telemetry.properties?.job_id,
      provider: "posthog",
      request_id: telemetry.properties?.request_id,
      service: "filerouter",
      ...serializeError(error),
    })
  }
}
