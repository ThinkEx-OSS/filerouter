export const FILEROUTER_API_KEY_PREFIX = "fr_"
export const FILEROUTER_CLI_CLIENT_ID = "filerouter-cli"
export const FILEROUTER_CLI_SCOPE = "jobs:create jobs:read"
export const FILEROUTER_DEFAULT_API_URL = "https://filerouter.dev"

export const HOSTED_JOBS_PATH = "/api/v1/jobs"
export const MAX_HOSTED_PROVIDER_OPTIONS_HEADER_BYTES = 64 * 1024

export const HOSTED_JOB_HEADERS = {
  fileName: "x-filerouter-filename",
  includeRaw: "x-filerouter-include-raw",
  operation: "x-filerouter-operation",
  outputs: "x-filerouter-outputs",
  pages: "x-filerouter-pages",
  provider: "x-filerouter-provider",
  providerOptions: "x-filerouter-provider-options",
  providers: "x-filerouter-providers",
} as const

export const hostedJobStatuses = [
  "queued",
  "running",
  "complete",
  "failed",
] as const

export type HostedJobStatus = (typeof hostedJobStatuses)[number]

export type HostedJobAccepted = { id: string; status: HostedJobStatus }

export type HostedJobResponse<Result> =
  | { error: string; id: string; status: "failed" }
  | { id: string; result: Result; status: "complete" }
  | { id: string; status: "queued" | "running" }
