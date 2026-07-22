import { createAutumnClient } from "@/integrations/autumn/client.server"
import {
  HOSTED_CREDIT_FEATURE_ID,
  HOSTED_RATE_CARD_VERSION,
} from "@/integrations/autumn/config"
import { estimateManagedExecution } from "@/integrations/autumn/managed-execution-cost"
import type {
  ManagedExecutionEstimate,
  ParsedProviderOutcome,
} from "@/integrations/autumn/managed-execution-cost"
import type { ProviderOutcome } from "@/workflows/document-results"

export interface AutumnUsageClient {
  track: (
    request: {
      customerId: string
      featureId: string
      properties: Record<string, boolean | number | string>
      value: number
      overageBehavior: "overflow"
    },
    options?: RequestInit
  ) => Promise<unknown>
}

interface AutumnUsageEnv {
  AUTUMN_SECRET_KEY?: string
  HOSTED_BILLING_ENABLED?: string
}

export interface TrackManagedExecutionInput {
  jobId: string
  operation: "compare" | "parse"
  providers: Array<ProviderOutcome>
  userId: string
}

export async function trackManagedExecutionUsage(
  env: AutumnUsageEnv,
  input: TrackManagedExecutionInput,
  client = createAutumnClient(env)
): Promise<
  | { skipped: true }
  | { trackedProviders: number; unpricedProviders: Array<string> }
> {
  if (!client) {
    return { skipped: true }
  }

  return trackManagedExecution(client, input)
}

export async function trackManagedExecution(
  client: AutumnUsageClient,
  input: TrackManagedExecutionInput
): Promise<{ trackedProviders: number; unpricedProviders: Array<string> }> {
  const parsedProviders = input.providers.filter(
    (provider): provider is ParsedProviderOutcome =>
      provider.status === "parsed"
  )
  const unpricedProviders: Array<string> = []
  const pricedProviders = parsedProviders.flatMap((provider) => {
    const estimate = estimateManagedExecution(provider)
    if (!estimate) {
      unpricedProviders.push(provider.provider)
      return []
    }
    return [{ estimate, provider }]
  })
  await Promise.all(
    pricedProviders.map(({ estimate, provider }) => {
      return client.track(
        {
          customerId: input.userId,
          featureId: HOSTED_CREDIT_FEATURE_ID,
          overageBehavior: "overflow",
          properties: usageProperties(input, provider, estimate),
          value: estimate.credits,
        },
        {
          headers: {
            "Idempotency-Key": `document-job:${input.jobId}:${provider.provider}`,
          },
        }
      )
    })
  )

  return { trackedProviders: pricedProviders.length, unpricedProviders }
}

function usageProperties(
  input: TrackManagedExecutionInput,
  provider: ParsedProviderOutcome,
  estimate: ManagedExecutionEstimate
): Record<string, boolean | number | string> {
  return {
    duration_ms: provider.durationMs,
    job_id: input.jobId,
    operation: input.operation,
    pages: provider.usage?.pages ?? provider.pageCount,
    provider: provider.provider,
    rate_card_version: HOSTED_RATE_CARD_VERSION,
    raw_cost_usd: estimate.rawCostUsd,
    ...(provider.usage?.costUsd !== undefined && {
      provider_cost_usd: provider.usage.costUsd,
    }),
    ...(provider.usage?.credits !== undefined && {
      provider_credits: provider.usage.credits,
    }),
  }
}
