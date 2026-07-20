import { OpenAPIHono } from "@hono/zod-openapi"
import { createMiddleware } from "hono/factory"
import { requestId } from "hono/request-id"

import { createJobRoute, getJobRoute, JobIdSchema } from "@/api/contracts"
import { problemResponse } from "@/api/problem"
import type { ApiPrincipal } from "@/lib/api-auth.server"
import { requireApiPrincipal } from "@/lib/api-auth.server"
import {
  createDocumentJob,
  getDocumentJobResponse,
} from "@/lib/document-jobs.server"
import { HttpError } from "@/lib/http.server"
import { getProviderSourceResponse } from "@/lib/document-source.server"

type ApiBindings = {
  Bindings: Cloudflare.Env
  Variables: { principal: ApiPrincipal }
}

function requireApiKey(permission: "create" | "read") {
  return createMiddleware<ApiBindings>(async (context, next) => {
    const principal = await requireApiPrincipal(context.req.raw, permission)
    context.set("principal", principal)
    await next()
  })
}

export const api = new OpenAPIHono<ApiBindings>({
  defaultHook: (result) => {
    if (!result.success) {
      throw new HttpError(
        400,
        result.error.issues[0]?.message ?? "Invalid request.",
        "invalid_request"
      )
    }
  },
})

api.use("*", requestId({ limitLength: 128 }))

api.onError((error, context) => {
  if (error instanceof HttpError) {
    return problemResponse(context, error)
  }

  console.error(
    JSON.stringify({
      error: error.message,
      method: context.req.method,
      path: context.req.path,
      requestId: context.get("requestId"),
    })
  )
  return problemResponse(
    context,
    new HttpError(500, "Internal server error", "internal_error")
  )
})

api.notFound((context) =>
  problemResponse(
    context,
    new HttpError(404, "API route not found.", "route_not_found")
  )
)

api.use("/api/v1/jobs", requireApiKey("create"))
api.use("/api/v1/jobs/:jobId", requireApiKey("read"))

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
    context.req.header("content-type")?.includes("application/json")
      ? context.req.valid("json")
      : undefined
  )
  if (result.replayed) {
    context.header("Idempotent-Replayed", "true")
    return context.json(result.job, 200)
  }
  return context.json(result.job, 202)
})

api.get("/api/v1/jobs/:jobId", async (context) => {
  const jobId = JobIdSchema.safeParse(context.req.param("jobId"))
  if (!jobId.success) {
    throw new HttpError(400, "Invalid job id.", "invalid_job_id")
  }
  const response = await getDocumentJobResponse(
    jobId.data,
    context.get("principal").userId,
    context.env
  )
  return response instanceof Response ? response : context.json(response, 200)
})
api.openAPIRegistry.registerPath(getJobRoute)

api.on(["GET", "HEAD"], "/api/v1/sources/:jobId/:fileName", async (context) => {
  const jobId = JobIdSchema.safeParse(context.req.param("jobId"))
  if (!jobId.success) {
    throw new HttpError(404, "Document source not found.", "source_not_found")
  }
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
  servers: [{ url: "https://filerouter.dev" }],
})
