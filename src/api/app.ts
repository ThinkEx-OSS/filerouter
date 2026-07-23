import { OpenAPIHono } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import { createMiddleware } from "hono/factory"
import { requestId } from "hono/request-id"
import {
  FILEROUTER_DEFAULT_API_URL,
  HOSTED_DOCUMENTS_PATH,
  HOSTED_EXECUTIONS_PATH,
  HOSTED_JOBS_PATH,
  HOSTED_PROVIDERS_PATH,
  MAX_HOSTED_JOB_REQUEST_BYTES,
} from "@file_router/sdk/hosted"

import {
  createDocumentRoute,
  createJobRoute,
  CreateDocumentRequestSchema,
  deleteDocumentRoute,
  DocumentIdSchema,
  ExecutionIdSchema,
  getDocumentRoute,
  getExecutionResultRoute,
  getJobRoute,
  IdempotencyKeySchema,
  listProvidersRoute,
} from "@/api/contracts"
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
  getDocumentJob,
  getExecutionResult,
} from "@/lib/document-jobs.server"
import { getProviderSourceResponse } from "@/lib/document-source.server"
import { createDocument, getDocument } from "@/lib/documents.server"
import { deleteDocument } from "@/lib/document-deletion.server"
import { HttpError } from "@/lib/http.server"
import { hostedProviderCatalog } from "@/lib/hosted-providers.server"
import {
  emitWideEvent,
  serializeError,
  type WideEvent,
} from "@/observability/log"

type ApiRequestEvent = Partial<WideEvent> & {
  credential_id?: string
  document_id?: string
  error_code?: string
  execution_id?: string
  job_id?: string
  request_id: string
  user_id?: string
}

type ApiBindings = {
  Bindings: Cloudflare.Env
  Variables: { principal: ApiPrincipal; requestEvent: ApiRequestEvent }
}

type ApiPermission = "create" | "read"

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

function requireApiKey(
  permission: ApiPermission | ((method: string) => ApiPermission)
) {
  return createMiddleware<ApiBindings>(async (context, next) => {
    const requiredPermission =
      typeof permission === "function"
        ? permission(context.req.method)
        : permission
    const principal = await requireApiPrincipal(
      context.req.raw,
      requiredPermission
    )
    context.set("principal", principal)
    Object.assign(context.get("requestEvent"), {
      credential_id: principal.credentialId,
      user_id: principal.userId,
    })
    await next()
  })
}

function isJsonRequest(request: Request): boolean {
  return (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() === "application/json"
  )
}

export const api = new OpenAPIHono<ApiBindings>({
  defaultHook: (result) => {
    if (!result.success) {
      const issue = result.error.issues[0]
      throw new HttpError(
        400,
        issue
          ? `${issue.path.join(".") || "request"}: ${issue.message}`
          : "Invalid request.",
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
        document_id: requestEvent.document_id,
        execution_id: requestEvent.execution_id,
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

const limitDocumentJsonBody = bodyLimit({
  maxSize: MAX_HOSTED_JOB_REQUEST_BYTES,
  onError: () => {
    throw new HttpError(413, "Document request is too large.", {
      code: "document_request_too_large",
    })
  },
})

api.use(
  HOSTED_DOCUMENTS_PATH,
  requireApiKey("create"),
  async (context, next) => {
    if (isJsonRequest(context.req.raw)) {
      return limitDocumentJsonBody(context, next)
    }
    await next()
  }
)
api.use(
  `${HOSTED_DOCUMENTS_PATH}/:documentId`,
  requireApiKey((method) => (method === "DELETE" ? "create" : "read"))
)
api.use(
  HOSTED_JOBS_PATH,
  requireApiKey("create"),
  bodyLimit({
    maxSize: MAX_HOSTED_JOB_REQUEST_BYTES,
    onError: () => {
      throw new HttpError(413, "Job request is too large.", {
        code: "job_request_too_large",
      })
    },
  })
)
api.use(`${HOSTED_JOBS_PATH}/:jobId`, requireApiKey("read"))
api.use(`${HOSTED_EXECUTIONS_PATH}/:executionId/result`, requireApiKey("read"))
api.use(HOSTED_PROVIDERS_PATH, requireApiKey("read"))

api.get("/api/v1/health", async (context) => {
  await context.env.DB.prepare("SELECT 1").first()
  context.header("Cache-Control", "no-store")
  return context.json({ status: "ok" as const })
})

api.post(HOSTED_DOCUMENTS_PATH, async (context) => {
  const idempotencyKey = IdempotencyKeySchema.safeParse(
    context.req.header("idempotency-key")
  )
  if (!idempotencyKey.success) {
    throw new HttpError(400, "Invalid idempotency key.", {
      code: "invalid_idempotency_key",
    })
  }
  const isJson = isJsonRequest(context.req.raw)
  let jsonBody: unknown
  if (isJson) {
    try {
      jsonBody = await context.req.raw.json()
    } catch {
      throw new HttpError(400, "Invalid document request.", {
        code: "invalid_document_request",
      })
    }
  }
  const validatedBody = isJson
    ? CreateDocumentRequestSchema.safeParse(jsonBody)
    : undefined
  if (validatedBody && !validatedBody.success) {
    throw new HttpError(
      400,
      validatedBody.error.issues[0]?.message ?? "Invalid document request.",
      { code: "invalid_document_request" }
    )
  }
  const result = await createDocument(
    validatedBody?.success
      ? {
          kind: "url",
          ...(validatedBody.data.name && { name: validatedBody.data.name }),
          url: validatedBody.data.url,
        }
      : { kind: "upload", request: context.req.raw },
    context.get("principal").userId,
    context.env,
    idempotencyKey.data
  )
  Object.assign(context.get("requestEvent"), {
    document_id: result.document.id,
    replayed: result.replayed,
  })
  scheduleBackgroundTask(
    context,
    captureServerTelemetry(context.env, {
      distinctId: context.get("principal").userId,
      event: "document_created",
      properties: {
        ...postHogTraceProperties(context.req.raw),
        document_id: result.document.id,
        replayed: result.replayed,
        request_id: context.get("requestId"),
      },
    })
  )
  if (result.replayed) {
    context.header("Idempotent-Replayed", "true")
    return context.json(result.document, 200)
  }
  return context.json(result.document, 201)
})
api.openAPIRegistry.registerPath(createDocumentRoute)

api.openapi(getDocumentRoute, async (context) => {
  const { documentId } = context.req.valid("param")
  context.get("requestEvent").document_id = documentId
  return context.json(
    await getDocument(documentId, context.get("principal").userId, context.env),
    200
  )
})

api.openapi(deleteDocumentRoute, async (context) => {
  const { documentId } = context.req.valid("param")
  context.get("requestEvent").document_id = documentId
  await deleteDocument(documentId, context.get("principal").userId, context.env)
  return context.body(null, 204)
})

api.openapi(createJobRoute, async (context) => {
  const input = context.req.valid("json")
  const idempotencyKey = context.req.valid("header")["idempotency-key"]
  const result = await createDocumentJob(
    input,
    context.get("principal").userId,
    context.env,
    idempotencyKey,
    context.get("requestId")
  )
  Object.assign(context.get("requestEvent"), {
    document_id: input.documentId,
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
        document_id: input.documentId,
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

api.openapi(getJobRoute, async (context) => {
  const { jobId } = context.req.valid("param")
  context.get("requestEvent").job_id = jobId
  return context.json(
    await getDocumentJob(jobId, context.get("principal").userId, context.env),
    200
  )
})

api.get(`${HOSTED_EXECUTIONS_PATH}/:executionId/result`, async (context) => {
  const executionId = ExecutionIdSchema.safeParse(
    context.req.param("executionId")
  )
  if (!executionId.success) {
    throw new HttpError(400, "Invalid execution id.", {
      code: "invalid_execution_id",
    })
  }
  context.get("requestEvent").execution_id = executionId.data
  return getExecutionResult(
    executionId.data,
    context.get("principal").userId,
    context.env
  )
})
api.openAPIRegistry.registerPath(getExecutionResultRoute)

api.openapi(listProvidersRoute, (context) =>
  context.json(hostedProviderCatalog(context.env), 200)
)

api.on(
  ["GET", "HEAD"],
  "/api/v1/sources/:documentId/:fileName",
  async (context) => {
    const documentId = DocumentIdSchema.safeParse(
      context.req.param("documentId")
    )
    if (!documentId.success) {
      throw new HttpError(404, "Document source not found.", {
        code: "source_not_found",
      })
    }
    context.get("requestEvent").document_id = documentId.data
    return getProviderSourceResponse(
      context.req.raw,
      context.env,
      documentId.data,
      context.req.param("fileName"),
      context.req.query("expires"),
      context.req.query("token")
    )
  }
)

api.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
  bearerFormat: "FileRouter API key",
  scheme: "bearer",
  type: "http",
})

api.doc31("/api/openapi.json", {
  info: {
    description:
      "Store documents, run provider executions, and retrieve normalized results.",
    title: "FileRouter API",
    version: "0.1.0",
  },
  openapi: "3.1.0",
  servers: [{ url: FILEROUTER_DEFAULT_API_URL }],
})
