import { describe, expect, test, vi } from "vite-plus/test"

import { estimateManagedExecution } from "@/integrations/autumn/managed-execution-cost"
import {
  MANAGED_EXECUTION_FEATURE_ID,
  MANAGED_EXECUTION_FREE_PLAN_ID,
  trackManagedExecutionForAccount,
} from "@/integrations/autumn/managed-execution"
import type { ProviderOutcome } from "@/workflows/document-results"

function parsed(
  input: Partial<Extract<ProviderOutcome, { status: "parsed" }>> &
    Pick<Extract<ProviderOutcome, { status: "parsed" }>, "provider">
): Extract<ProviderOutcome, { status: "parsed" }> {
  return {
    durationMs: 1_000,
    pageCount: 1,
    resultKey: "jobs/test/result.json",
    status: "parsed",
    ...input,
  }
}

describe("managed execution pricing", () => {
  test("uses provider-reported dollar cost when available", () => {
    expect(
      estimateManagedExecution(
        parsed({
          pageCount: 10,
          provider: "datalab",
          usage: { costUsd: 0.04, pages: 10 },
        })
      )
    ).toEqual({ rawCostUsd: 0.04025, units: 40.25 })
  })

  test("converts LlamaParse credits into upstream cost", () => {
    expect(
      estimateManagedExecution(
        parsed({
          pageCount: 10,
          provider: "llamaparse",
          usage: { credits: 30, pages: 10 },
        })
      )
    ).toEqual({ rawCostUsd: 0.03775, units: 37.75 })
  })

  test("prices Mistral OCR from processed pages", () => {
    expect(
      estimateManagedExecution(
        parsed({
          pageCount: 10,
          provider: "mistral-ocr",
          usage: { costUsd: 0.04, pages: 10 },
        })
      )
    ).toEqual({ rawCostUsd: 0.04025, units: 40.25 })
  })

  test("does not guess mode-dependent provider prices", () => {
    expect(
      estimateManagedExecution(
        parsed({ pageCount: 10, provider: "llamaparse", usage: { pages: 10 } })
      )
    ).toBeUndefined()
    expect(
      estimateManagedExecution(
        parsed({ pageCount: 10, provider: "datalab", usage: { pages: 10 } })
      )
    ).toBeUndefined()
    expect(
      estimateManagedExecution(
        parsed({ pageCount: 10, provider: "mistral-ocr", usage: { pages: 10 } })
      )
    ).toBeUndefined()
  })

  test("estimates native parser compute from its provisioned resources", () => {
    const estimate = estimateManagedExecution(
      parsed({ durationMs: 10_000, provider: "liteparse" })
    )

    expect(estimate).toBeDefined()
    if (!estimate) {
      throw new Error("Expected a native parser estimate.")
    }
    expect(estimate.rawCostUsd).toBeCloseTo(0.0010892)
    expect(estimate.units).toBeCloseTo(1.0892)
  })

  test("syncs the customer and records idempotent provider events", async () => {
    const getOrCreate = vi.fn().mockResolvedValue({})
    const track = vi.fn().mockResolvedValue({})

    await expect(
      trackManagedExecutionForAccount(
        { customers: { getOrCreate }, track },
        {
          jobId: "job-123",
          operation: "compare",
          providers: [
            parsed({
              pageCount: 2,
              provider: "mistral-ocr",
              usage: { costUsd: 0.008, pages: 2 },
            }),
            {
              durationMs: 100,
              error: { message: "failed" },
              provider: "datalab",
              status: "failed",
            },
          ],
          userId: "user-123",
        },
        { email: "dev@example.com", name: "Developer" }
      )
    ).resolves.toEqual({ trackedProviders: 1, unpricedProviders: [] })

    expect(getOrCreate).toHaveBeenCalledWith({
      autoEnablePlanId: MANAGED_EXECUTION_FREE_PLAN_ID,
      customerId: "user-123",
      email: "dev@example.com",
      metadata: { account_type: "developer", product: "filerouter" },
      name: "Developer",
    })
    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "user-123",
        featureId: MANAGED_EXECUTION_FEATURE_ID,
        value: 8.25,
      }),
      {
        headers: {
          "Idempotency-Key": "document-job:job-123:mistral-ocr",
        },
      }
    )
  })
})
