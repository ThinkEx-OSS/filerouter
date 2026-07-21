import type { ProviderOutcome } from "@/workflows/document-results"

const MILLIUSD_PER_USD = 1_000

// Provider list prices verified 2026-07-21:
// https://www.llamaindex.ai/pricing
// https://mistral.ai/pricing/api/
// https://www.datalab.to/pricing
// Prefer provider-reported cost so discounts and option-specific pricing flow
// through unchanged.
const LLAMAPARSE_USD_PER_CREDIT = 0.00125

// Covers the Worker, Workflow, D1, and R2 work around one provider execution.
const PLATFORM_USD_PER_EXECUTION = 0.00025

// Native parser estimates use https://developers.cloudflare.com/containers/pricing/
// plus one sleep-after window per execution. Shared warm windows make this
// estimate deliberately conservative at higher volume.
const CONTAINER_IDLE_ALLOWANCE_SECONDS = 60
const CONTAINER_CPU_USD_PER_VCPU_SECOND = 0.00002
const CONTAINER_MEMORY_USD_PER_GIB_SECOND = 0.0000025
const CONTAINER_DISK_USD_PER_GB_SECOND = 0.00000007

export type ParsedProviderOutcome = Extract<
  ProviderOutcome,
  { status: "parsed" }
>

export interface ManagedExecutionEstimate {
  rawCostUsd: number
  units: number
}

export function estimateManagedExecution(
  provider: ParsedProviderOutcome
): ManagedExecutionEstimate | undefined {
  const providerCost = providerCostUsd(provider)
  if (providerCost === undefined) {
    return undefined
  }
  const rawCostUsd = providerCost + PLATFORM_USD_PER_EXECUTION
  return {
    rawCostUsd,
    units: rawCostUsd * MILLIUSD_PER_USD,
  }
}

function providerCostUsd(provider: ParsedProviderOutcome): number | undefined {
  const reportedCost = provider.usage?.costUsd
  if (isNonNegativeFinite(reportedCost)) {
    return reportedCost
  }

  switch (provider.provider) {
    case "llamaparse": {
      const credits = provider.usage?.credits
      return isNonNegativeFinite(credits)
        ? credits * LLAMAPARSE_USD_PER_CREDIT
        : undefined
    }
    case "mistral-ocr":
    case "datalab":
      return undefined
    case "liteparse":
      return containerCostUsd(provider.durationMs, {
        diskGb: 8,
        memoryGib: 4,
        vcpu: 0.5,
      })
    case "pdf-inspector":
      return containerCostUsd(provider.durationMs, {
        diskGb: 4,
        memoryGib: 1,
        vcpu: 0.25,
      })
    default:
      throw new Error(`Cannot price unknown provider: ${provider.provider}`)
  }
}

function containerCostUsd(
  durationMs: number,
  resources: { diskGb: number; memoryGib: number; vcpu: number }
): number {
  const activeSeconds = Math.max(0, durationMs) / 1_000
  const memoryAndDiskPerSecond =
    resources.memoryGib * CONTAINER_MEMORY_USD_PER_GIB_SECOND +
    resources.diskGb * CONTAINER_DISK_USD_PER_GB_SECOND
  const cpuPerSecond = resources.vcpu * CONTAINER_CPU_USD_PER_VCPU_SECOND
  return (
    activeSeconds * (memoryAndDiskPerSecond + cpuPerSecond) +
    CONTAINER_IDLE_ALLOWANCE_SECONDS * memoryAndDiskPerSecond
  )
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}
