import { OpenAPIHono } from "@hono/zod-openapi"
import { createMiddleware } from "hono/factory"
import { requestId } from "hono/request-id"
import {
  FILEROUTER_DEFAULT_API_URL,
  HOSTED_JOBS_PATH,
} from "@file_router/sdk/hosted"

import { createJobRoute, getJobRoute, JobIdSchema } from "@/api/contracts"
import { problemResponse } from "@/api/problem"
import {
  captureServerTelemetry,
  postHogDistinctId,
  postHogTraceProperties,
} from "@/integrations/posthog/server"
import type { ApiPrincipal } from "@/lib/api-auth.server"
import { requireApiPrincipal } from "@/lib/api-auth.server"
import {
  createDocumentJob,
  getDocumentJobResponse,
} from "@/lib/document-jobs.server"
import { HttpError } from "@/lib/http.server"
import { getProviderSourceResponse } from "@/lib/document-source.server"
import {
  emitWideEvent,
  serializeError,
  type WideEvent,
} from "@/observability/log"

type ApiRequestEvent = Partial<WideEvent> & {
  credential_id?: string
  error_code?: string
  job_id?: string
  request_id: string
  user_id?: string
}

type ApiBindings = {
  Bindings: Cloudflare.Env
  Variables: { principal: ApiPrincipal; requestEvent: ApiRequestEvent }
}

function scheduleBackgroundTask(
  context: { executionCtx: { waitUntil(task: Promise<unknown>): void } },
  task: Promise<void>
): void {
  try {
    context.executionCtx.waitUntil(task)
  } catch {
    // Direct Hono invocations do not have a Cloudflare ExecutionContext.
    // The task is already running and telemetry delivery handles its own errors.
  }
}

function requireApiKey(permission: "create" | "read") {
  return createMiddleware<ApiBindings>(async (context, next) => {
    const principal = await requireApiPrincipal(context.req.raw, permission)
    context.set("principal", principal)
    Object.assign(context.get("requestEvent"), {
      credential_id: principal.credentialId,
      user_id: principal.userId,
    })
    await next()
  })
}

export const api = new OpenAPIHono<ApiBindings>({
  defaultHook: (result) => {
    if (!result.success) {
      throw new HttpError(
        400,
        result.error.issues[0]?.message ?? "Invalid request.",
        { code: "invalid_request" }
      )
    }
  },
})

api.use("*", requestId({ limitLength: 128 }))
api.use("*", async (context, next) => {
  const startedAt = Date.now()
  const requestEvent: ApiRequestEvent = {
    request_id: context.get("requestId"),
  }
  context.set("requestEvent", requestEvent)
  context.header("X-Request-Id", requestEvent.request_id)

  let failure: unknown
  try {
    await next()
  } catch (error) {
    failure = error
    if (error instanceof HttpError) {
      requestEvent.error_code = error.code ?? "http_error"
    }
    throw error
  } finally {
    const status =
      failure instanceof HttpError
        ? failure.status
        : failure
          ? 500
          : context.res.status
    emitWideEvent(context.env, status >= 500 ? "error" : "info", {
      ...requestEvent,
      colo: context.req.raw.cf?.colo,
      duration_ms: Date.now() - startedAt,
      event: "api_request_completed",
      method: context.req.method,
      outcome:
        status >= 500
          ? "error"
          : status === 404
            ? "not_found"
            : status >= 400
              ? "rejected"
              : "success",
      path: context.req.path,
      service: "filerouter-api",
      status_code: status,
      ...(failure ? serializeError(failure) : {}),
    })
  }
})

api.onError((error, context) => {
  if (error instanceof HttpError) {
    return problemResponse(context, error)
  }

  const requestEvent = context.get("requestEvent")
  scheduleBackgroundTask(
    context,
    captureServerTelemetry(context.env, {
      distinctId:
        requestEvent.user_id ??
        postHogDistinctId(context.req.raw, requestEvent.request_id),
      exception: error,
      properties: {
        ...postHogTraceProperties(context.req.raw),
        job_id: requestEvent.job_id,
        method: context.req.method,
        path: context.req.path,
        request_id: requestEvent.request_id,
        service: "filerouter-api",
      },
    })
  )
  return problemResponse(
    context,
    new HttpError(500, "Internal server error", { code: "internal_error" })
  )
})

api.notFound((context) => {
  context.get("requestEvent").error_code = "route_not_found"
  return problemResponse(
    context,
    new HttpError(404, "API route not found.", { code: "route_not_found" })
  )
})

api.use(HOSTED_JOBS_PATH, requireApiKey("create"))
api.use(`${HOSTED_JOBS_PATH}/:jobId`, requireApiKey("read"))

api.get("/api/v1/health", async (context) => {
  await context.env.DB.prepare("SELECT 1").first()
  context.header("Cache-Control", "no-store")
  return context.json({ status: "ok" as const })
})

api.openapi(createJobRoute, async (context) => {
  const idempotencyKey = context.req.valid("header")["idempotency-key"]
  const result = await createDocumentJob(
    context.req.raw,
    context.get("principal").userId,
    context.env,
    idempotencyKey,
    context.get("requestId"),
    context.req.header("content-type")?.includes("application/json")
      ? context.req.valid("json")
      : undefined
  )
  Object.assign(context.get("requestEvent"), {
    job_id: result.job.id,
    replayed: result.replayed,
  })
  scheduleBackgroundTask(
    context,
    captureServerTelemetry(context.env, {
      distinctId: context.get("principal").userId,
      event: "document_job_submitted",
      properties: {
        ...postHogTraceProperties(context.req.raw),
        job_id: result.job.id,
        replayed: result.replayed,
        request_id: context.get("requestId"),
      },
    })
  )
  if (result.replayed) {
    context.header("Idempotent-Replayed", "true")
    return context.json(result.job, 200)
  }
  return context.json(result.job, 202)
})

api.get(`${HOSTED_JOBS_PATH}/:jobId`, async (context) => {
  const jobId = JobIdSchema.safeParse(context.req.param("jobId"))
  if (!jobId.success) {
    throw new HttpError(400, "Invalid job id.", { code: "invalid_job_id" })
  }
  context.get("requestEvent").job_id = jobId.data
  const response = await getDocumentJobResponse(
    jobId.data,
    context.get("principal").userId,
    context.env,
    context.get("requestId")
  )
  return response instanceof Response ? response : context.json(response, 200)
})
api.openAPIRegistry.registerPath(getJobRoute)

api.on(["GET", "HEAD"], "/api/v1/sources/:jobId/:fileName", async (context) => {
  const jobId = JobIdSchema.safeParse(context.req.param("jobId"))
  if (!jobId.success) {
    throw new HttpError(404, "Document source not found.", {
      code: "source_not_found",
    })
  }
  context.get("requestEvent").job_id = jobId.data
  return getProviderSourceResponse(
    context.req.raw,
    context.env,
    jobId.data,
    context.req.param("fileName"),
    context.req.query("expires"),
    context.req.query("token")
  )
})

api.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
  bearerFormat: "FileRouter API key",
  scheme: "bearer",
  type: "http",
})

api.doc31("/api/openapi.json", {
  info: {
    description: "Submit document parsing jobs and retrieve their results.",
    title: "FileRouter API",
    version: "0.1.0",
  },
  openapi: "3.1.0",
  servers: [{ url: FILEROUTER_DEFAULT_API_URL }],
})
