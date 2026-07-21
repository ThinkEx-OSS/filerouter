import { Autumn } from "autumn-js"
import { eq } from "drizzle-orm"

import { user } from "@/db/schema"
import { createDb } from "@/db/server"
import { estimateManagedExecution } from "@/integrations/autumn/managed-execution-cost"
import type {
  ManagedExecutionEstimate,
  ParsedProviderOutcome,
} from "@/integrations/autumn/managed-execution-cost"
import type { ProviderOutcome } from "@/workflows/document-results"

export const MANAGED_EXECUTION_FEATURE_ID = "managed_execution_units"
export const MANAGED_EXECUTION_FREE_PLAN_ID = "developer"

export interface AutumnUsageClient {
  customers: {
    getOrCreate: (
      request: {
        autoEnablePlanId: string
        customerId: string
        email: string
        metadata: Record<string, string>
        name: string
      },
      options?: RequestInit
    ) => Promise<unknown>
  }
  track: (
    request: {
      customerId: string
      featureId: string
      properties: Record<string, boolean | number | string>
      value: number
    },
    options?: RequestInit
  ) => Promise<unknown>
}

interface AutumnUsageEnv {
  AUTUMN_SECRET_KEY?: string
  DB: D1Database
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
  client = createAutumnClient(env.AUTUMN_SECRET_KEY)
): Promise<
  | { skipped: true }
  | { trackedProviders: number; unpricedProviders: Array<string> }
> {
  if (!client) {
    return { skipped: true }
  }

  const account = await createDb(env.DB)
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, input.userId))
    .get()
  if (!account) {
    throw new Error(`Cannot meter job ${input.jobId}: user not found.`)
  }

  return trackManagedExecutionForAccount(client, input, account)
}

export async function trackManagedExecutionForAccount(
  client: AutumnUsageClient,
  input: TrackManagedExecutionInput,
  account: { email: string; name: string }
): Promise<{ trackedProviders: number; unpricedProviders: Array<string> }> {
  await client.customers.getOrCreate({
    autoEnablePlanId: MANAGED_EXECUTION_FREE_PLAN_ID,
    customerId: input.userId,
    email: account.email,
    metadata: { account_type: "developer", product: "filerouter" },
    name: account.name,
  })

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
          featureId: MANAGED_EXECUTION_FEATURE_ID,
          properties: usageProperties(input, provider, estimate),
          value: estimate.units,
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
    raw_cost_usd: estimate.rawCostUsd,
    ...(provider.usage?.costUsd !== undefined && {
      provider_cost_usd: provider.usage.costUsd,
    }),
    ...(provider.usage?.credits !== undefined && {
      provider_credits: provider.usage.credits,
    }),
  }
}

function createAutumnClient(
  secretKey: string | undefined
): AutumnUsageClient | undefined {
  if (!secretKey?.trim()) {
    return undefined
  }
  return new Autumn({ secretKey, timeoutMs: 10_000 })
}
