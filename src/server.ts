import handler from "@tanstack/react-start/server-entry"

import { api } from "@/api/app"
import {
  captureServerTelemetry,
  postHogDistinctId,
  postHogTraceProperties,
} from "@/integrations/posthog/server"
import { runDocumentRetentionCleanup } from "@/lib/document-retention.server"
import { isHonoApiPath } from "@/lib/request-routing"
import {
  emitWideEvent,
  requestIdFrom,
  serializeError,
  withRequestId,
  withResponseRequestId,
} from "@/observability/log"

export { DocumentWorkflow } from "@/workflows/document-workflow"

export default {
  fetch(request, env, context) {
    const requestId = requestIdFrom(request)
    const routedRequest = withRequestId(request, requestId)
    const pathname = new URL(routedRequest.url).pathname
    if (isHonoApiPath(pathname)) {
      return api.fetch(routedRequest, env, context)
    }
    return handleWebsiteRequest(routedRequest, env, context, requestId)
  },
  scheduled(_controller, env, context) {
    context.waitUntil(runScheduledCleanup(env))
  },
} satisfies ExportedHandler<Env>

async function handleWebsiteRequest(
  request: Request,
  env: Cloudflare.Env,
  context: ExecutionContext,
  requestId: string
): Promise<Response> {
  const startedAt = Date.now()
  const url = new URL(request.url)
  let response: Response | undefined
  let failure: unknown

  try {
    response = await handler.fetch(request)
    return withResponseRequestId(response, requestId)
  } catch (error) {
    failure = error
    context.waitUntil(
      captureServerTelemetry(env, {
        distinctId: postHogDistinctId(request, requestId),
        exception: error,
        properties: {
          ...postHogTraceProperties(request),
          path: url.pathname,
          request_id: requestId,
          service: "filerouter-web",
        },
      })
    )
    throw error
  } finally {
    const status = response?.status ?? 500
    emitWideEvent(env, status >= 500 ? "error" : "info", {
      colo: request.cf?.colo,
      duration_ms: Date.now() - startedAt,
      event: "http_request_completed",
      method: request.method,
      outcome:
        status >= 500
          ? "error"
          : status === 404
            ? "not_found"
            : status >= 400
              ? "rejected"
              : "success",
      path: url.pathname,
      request_id: requestId,
      service: "filerouter-web",
      status_code: status,
      ...(failure ? serializeError(failure) : {}),
    })
  }
}

async function runScheduledCleanup(env: Cloudflare.Env): Promise<void> {
  const startedAt = Date.now()
  try {
    const result = await runDocumentRetentionCleanup(env)
    emitWideEvent(env, "info", {
      ...result,
      duration_ms: Date.now() - startedAt,
      event: "document_retention_completed",
      outcome: "success",
      service: "filerouter",
    })
  } catch (error) {
    emitWideEvent(env, "error", {
      duration_ms: Date.now() - startedAt,
      event: "document_retention_completed",
      outcome: "error",
      service: "filerouter",
      ...serializeError(error),
    })
    throw error
  }
}
