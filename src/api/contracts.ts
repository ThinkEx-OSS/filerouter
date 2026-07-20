import { createRoute, z } from "@hono/zod-openapi"
import { parseOutputIds } from "@file_router/sdk"
import { providerIds } from "@file_router/sdk/catalog"

export const ProviderIdSchema = z.enum(providerIds)

export const ParseOutputSchema = z.enum(parseOutputIds)

const HttpUrlSchema = z
  .url()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    { message: "Document URL must use http or https." }
  )

const UrlSourceSchema = z
  .object({ url: HttpUrlSchema })
  .strict()
  .openapi("DocumentUrlSource")

const BaseJobSchema = z.object({
  includeRaw: z.boolean().optional(),
  outputs: z.array(ParseOutputSchema).min(1),
  pages: z.array(z.number().int().positive()).optional(),
  providerOptions: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional(),
  source: UrlSourceSchema,
})

export const DocumentJobRequestSchema = z
  .discriminatedUnion("operation", [
    BaseJobSchema.extend({
      operation: z.literal("parse"),
      provider: ProviderIdSchema.optional(),
    }).strict(),
    BaseJobSchema.extend({
      operation: z.literal("compare"),
      providers: z.array(ProviderIdSchema).min(1).optional(),
    }).strict(),
  ])
  .openapi("CreateDocumentJobRequest")

const IdempotencyKeySchema = z.string().trim().min(8).max(255).openapi({
  description: "A unique key for safely retrying this job creation request.",
  example: "01J2Y9QX3MXJQHD2YQ9N7J93M4",
})

const CreateJobHeadersSchema = z.object({
  "idempotency-key": IdempotencyKeySchema,
  "x-filerouter-filename": z.string().optional(),
  "x-filerouter-include-raw": z.enum(["true", "false"]).optional(),
  "x-filerouter-operation": z.enum(["parse", "compare"]).optional(),
  "x-filerouter-outputs": z.string().optional(),
  "x-filerouter-pages": z.string().optional(),
  "x-filerouter-provider": ProviderIdSchema.optional(),
  "x-filerouter-provider-options": z.string().optional(),
  "x-filerouter-providers": z.string().optional(),
})

export const JobIdSchema = z.string().uuid().openapi({
  example: "550e8400-e29b-41d4-a716-446655440000",
})

const JobStatusSchema = z.enum(["queued", "running", "complete", "failed"])

const JobAcceptedSchema = z
  .object({ id: JobIdSchema, status: JobStatusSchema })
  .openapi("DocumentJobAccepted")

const JobResponseSchema = z
  .union([
    z.object({ id: JobIdSchema, status: z.enum(["queued", "running"]) }),
    z.object({
      error: z.string().nullable(),
      id: JobIdSchema,
      status: z.literal("failed"),
    }),
    z.object({
      id: JobIdSchema,
      result: z.record(z.string(), z.unknown()),
      status: z.literal("complete"),
    }),
  ])
  .openapi("DocumentJob")

const ProblemSchema = z
  .object({
    code: z.string(),
    detail: z.string(),
    instance: z.string(),
    request_id: z.string(),
    status: z.number().int(),
    title: z.string(),
    type: z.string(),
  })
  .openapi("Problem")

const problem = {
  content: { "application/problem+json": { schema: ProblemSchema } },
  description: "Problem details",
}

export const createJobRoute = createRoute({
  description:
    "Creates a hosted parse or comparison job. Send JSON for public URLs or a binary body with X-FileRouter-* headers for uploads.",
  method: "post",
  path: "/api/v1/jobs",
  request: {
    body: {
      content: {
        "application/json": { schema: DocumentJobRequestSchema },
        "application/octet-stream": {
          schema: z.string().openapi({ format: "binary" }),
        },
      },
      required: false,
    },
    headers: CreateJobHeadersSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: JobAcceptedSchema } },
      description: "Existing job replayed for this idempotency key",
    },
    202: {
      content: { "application/json": { schema: JobAcceptedSchema } },
      description: "Job accepted",
    },
    400: problem,
    401: problem,
    409: problem,
    413: problem,
    500: problem,
  },
  security: [{ BearerAuth: [] }],
  summary: "Create a document job",
  tags: ["Jobs"],
})

export const getJobRoute = createRoute({
  method: "get",
  path: "/api/v1/jobs/{jobId}",
  request: { params: z.object({ jobId: JobIdSchema }) },
  responses: {
    200: {
      content: { "application/json": { schema: JobResponseSchema } },
      description: "Current job state or completed result",
    },
    401: problem,
    404: problem,
    410: problem,
    500: problem,
  },
  security: [{ BearerAuth: [] }],
  summary: "Get a document job",
  tags: ["Jobs"],
})

export type ProviderId = z.infer<typeof ProviderIdSchema>
