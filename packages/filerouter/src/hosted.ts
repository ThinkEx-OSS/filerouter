import type { ParseOutput, ParseResult, ProviderCapabilities } from "./types"
import type { ProviderId } from "./catalog"

export const FILEROUTER_API_KEY_PREFIX = "fr_"
export const FILEROUTER_VERSION = "0.2.0"
export const FILEROUTER_CLI_CLIENT_ID = "filerouter-cli"
export const FILEROUTER_CLI_SCOPE = "jobs:create jobs:read"
export const FILEROUTER_DEFAULT_API_URL = "https://filerouter.dev"
export const MAX_HOSTED_JOB_REQUEST_BYTES = 64 * 1024
export const MAX_HOSTED_METADATA_ENTRIES = 50

export const HOSTED_DOCUMENTS_PATH = "/api/v1/documents"
export const HOSTED_EXECUTIONS_PATH = "/api/v1/executions"
export const HOSTED_JOBS_PATH = "/api/v1/jobs"
export const HOSTED_PROVIDERS_PATH = "/api/v1/providers"

export const hostedDocumentStatuses = ["ready", "expired"] as const
export type HostedDocumentStatus = (typeof hostedDocumentStatuses)[number]

export const hostedJobStatuses = [
  "queued",
  "running",
  "complete",
  "failed",
] as const
export type HostedJobStatus = (typeof hostedJobStatuses)[number]

export const hostedExecutionStatuses = [
  "queued",
  "running",
  "complete",
  "failed",
] as const
export type HostedExecutionStatus = (typeof hostedExecutionStatuses)[number]

export interface HostedDocument {
  contentType: string
  createdAt: string
  etag: string
  expiresAt: string
  id: string
  name: string
  size: number
  status: HostedDocumentStatus
}

export interface HostedProviderTarget {
  includeRaw?: boolean
  options?: Record<string, unknown>
  outputs?: Array<ParseOutput>
  pages?: Array<number>
  provider: ProviderId
}

export interface HostedExecution {
  completedAt?: string
  createdAt: string
  durationMs?: number
  error?: { code?: string; message: string }
  id: string
  jobId: string
  outputs: Array<ParseOutput>
  pageCount?: number
  provider: ProviderId
  resultAvailable: boolean
  resultExpiresAt?: string
  status: HostedExecutionStatus
  usage?: ParseResult["usage"]
}

export interface HostedJob {
  createdAt: string
  documentId: string
  error?: string
  executions: Array<HostedExecution>
  id: string
  metadata?: Record<string, string>
  status: HostedJobStatus
  updatedAt: string
}

export interface HostedJobAccepted {
  id: string
  status: HostedJobStatus
}

export interface HostedProvider {
  capabilities: ProviderCapabilities
  id: ProviderId
  name: string
}
