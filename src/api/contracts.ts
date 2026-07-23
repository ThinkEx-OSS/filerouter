import { createRoute, z } from "@hono/zod-openapi"
import { parseOutputIds } from "@file_router/sdk"
import {
  HOSTED_DOCUMENTS_PATH,
  HOSTED_EXECUTIONS_PATH,
  HOSTED_JOBS_PATH,
  HOSTED_PROVIDERS_PATH,
  hostedDocumentStatuses,
  hostedExecutionStatuses,
  hostedJobStatuses,
  MAX_HOSTED_METADATA_ENTRIES,
} from "@file_router/sdk/hosted"
import { providerIds } from "@file_router/sdk/catalog"

export const ProviderIdSchema = z.enum(providerIds)
export type ProviderId = z.infer<typeof ProviderIdSchema>

export const ParseOutputSchema = z.enum(parseOutputIds)

const HttpUrlSchema = z
  .url()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    { message: "Document URL must use http or https." }
  )

export const CreateDocumentRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    url: HttpUrlSchema,
  })
  .strict()
  .openapi("CreateDocumentRequest")

export const IdempotencyKeySchema = z.string().trim().min(8).max(255).openapi({
  description: "A unique key for safely retrying this request.",
  example: "01J2Y9QX3MXJQHD2YQ9N7J93M4",
})

const IdempotencyHeadersSchema = z.object({
  "idempotency-key": IdempotencyKeySchema,
  "x-filerouter-content-type": z.string().optional(),
  "x-filerouter-filename": z.string().optional(),
})

const ResourceIdSchema = z.string().uuid()
export const DocumentIdSchema = ResourceIdSchema.openapi("DocumentId")
export const ExecutionIdSchema = ResourceIdSchema.openapi("ExecutionId")
export const JobIdSchema = ResourceIdSchema.openapi("JobId")

const DocumentSchema = z
  .object({
    contentType: z.string(),
    createdAt: z.iso.datetime(),
    etag: z.string(),
    expiresAt: z.iso.datetime(),
    id: DocumentIdSchema,
    name: z.string(),
    size: z.number().int().nonnegative(),
    status: z.enum(hostedDocumentStatuses),
  })
  .openapi("Document")

const ProviderTargetSchema = z
  .object({
    includeRaw: z.boolean().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    outputs: z.array(ParseOutputSchema).min(1).optional(),
    pages: z.array(z.number().int().positive()).min(1).optional(),
    provider: ProviderIdSchema,
  })
  .strict()
  .openapi("ProviderTarget")

export const CreateJobRequestSchema = z
  .object({
    documentId: DocumentIdSchema,
    metadata: z
      .record(z.string().max(64), z.string().max(500))
      .refine(
        (value) => Object.keys(value).length <= MAX_HOSTED_METADATA_ENTRIES,
        {
          message: `Metadata is limited to ${MAX_HOSTED_METADATA_ENTRIES} entries.`,
        }
      )
      .optional(),
    outputs: z.array(ParseOutputSchema).min(1),
    providers: z.array(ProviderTargetSchema).min(1).max(providerIds.length),
  })
  .strict()
  .superRefine((value, context) => {
    const providers = value.providers.map((target) => target.provider)
    if (new Set(providers).size !== providers.length) {
      context.addIssue({
        code: "custom",
        message: "Each provider may appear only once per job.",
        path: ["providers"],
      })
    }
  })
  .openapi("CreateJobRequest")

const ExecutionErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
})

const ExecutionSchema = z
  .object({
    completedAt: z.iso.datetime().optional(),
    createdAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative().optional(),
    error: ExecutionErrorSchema.optional(),
    id: ExecutionIdSchema,
    jobId: JobIdSchema,
    outputs: z.array(ParseOutputSchema),
    pageCount: z.number().int().nonnegative().optional(),
    provider: ProviderIdSchema,
    resultAvailable: z.boolean(),
    resultExpiresAt: z.iso.datetime().optional(),
    status: z.enum(hostedExecutionStatuses),
    usage: z
      .object({
        costUsd: z.number().nonnegative().optional(),
        credits: z.number().nonnegative().optional(),
        pages: z.number().int().nonnegative().optional(),
      })
      .optional(),
  })
  .openapi("Execution")

const JobSchema = z
  .object({
    createdAt: z.iso.datetime(),
    documentId: DocumentIdSchema,
    error: z.string().optional(),
    executions: z.array(ExecutionSchema),
    id: JobIdSchema,
    metadata: z.record(z.string(), z.string()).optional(),
    status: z.enum(hostedJobStatuses),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Job")

const JobAcceptedSchema = z
  .object({ id: JobIdSchema, status: z.enum(hostedJobStatuses) })
  .openapi("JobAccepted")

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

export const createDocumentRoute = createRoute({
  description:
    "Stores an immutable document from a binary body or a publicly reachable URL.",
  method: "post",
  path: HOSTED_DOCUMENTS_PATH,
  request: {
    body: {
      content: {
        "application/json": { schema: CreateDocumentRequestSchema },
        "application/octet-stream": {
          schema: z.any().openapi({ format: "binary", type: "string" }),
        },
      },
      required: true,
    },
    headers: IdempotencyHeadersSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DocumentSchema } },
      description: "Existing document replayed for this idempotency key",
    },
    201: {
      content: { "application/json": { schema: DocumentSchema } },
      description: "Document stored",
    },
    400: problem,
    401: problem,
    409: problem,
    413: problem,
    429: problem,
    500: problem,
  },
  security: [{ BearerAuth: [] }],
  summary: "Create a document",
  tags: ["Documents"],
})

export const getDocumentRoute = createRoute({
  method: "get",
  path: `${HOSTED_DOCUMENTS_PATH}/{documentId}`,
  request: { params: z.object({ documentId: DocumentIdSchema }) },
  responses: {
    200: {
      content: { "application/json": { schema: DocumentSchema } },
      description: "Document metadata",
    },
    400: problem,
    401: problem,
    404: problem,
    429: problem,
    500: problem,
  },
  security: [{ BearerAuth: [] }],
  summary: "Get a document",
  tags: ["Documents"],
})

export const createJobRoute = createRoute({
  description:
    "Runs one or more provider executions against a stored document.",
  method: "post",
  path: HOSTED_JOBS_PATH,
  request: {
    body: {
      content: { "application/json": { schema: CreateJobRequestSchema } },
      required: true,
    },
    headers: IdempotencyHeadersSchema.pick({ "idempotency-key": true }),
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
    402: problem,
    404: problem,
    409: problem,
    413: problem,
    429: problem,
    500: problem,
  },
  security: [{ BearerAuth: [] }],
  summary: "Create a job",
  tags: ["Jobs"],
})

export const getJobRoute = createRoute({
  method: "get",
  path: `${HOSTED_JOBS_PATH}/{jobId}`,
  request: { params: z.object({ jobId: JobIdSchema }) },
  responses: {
    200: {
      content: { "application/json": { schema: JobSchema } },
      description: "Job state and provider executions",
    },
    400: problem,
    401: problem,
    404: problem,
    429: problem,
    500: problem,
  },
  security: [{ BearerAuth: [] }],
  summary: "Get a job",
  tags: ["Jobs"],
})

export const getExecutionResultRoute = createRoute({
  method: "get",
  path: `${HOSTED_EXECUTIONS_PATH}/{executionId}/result`,
  request: { params: z.object({ executionId: ExecutionIdSchema }) },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.record(z.string(), z.unknown()) },
      },
      description: "Normalized provider result",
    },
    400: problem,
    401: problem,
    404: problem,
    410: problem,
    429: problem,
    500: problem,
  },
  security: [{ BearerAuth: [] }],
  summary: "Get an execution result",
  tags: ["Executions"],
})

const ProviderSchema = z.object({
  capabilities: z.object({
    execution: z.enum(["async", "sync"]),
    features: z.array(z.string()).optional(),
    outputs: z.array(ParseOutputSchema),
  }),
  id: ProviderIdSchema,
  name: z.string(),
})

export const listProvidersRoute = createRoute({
  method: "get",
  path: HOSTED_PROVIDERS_PATH,
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ data: z.array(ProviderSchema) }),
        },
      },
      description: "Hosted provider catalog",
    },
    401: problem,
    429: problem,
    500: problem,
  },
  security: [{ BearerAuth: [] }],
  summary: "List hosted providers",
  tags: ["Providers"],
})
