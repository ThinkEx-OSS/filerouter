import { describe, expect, test, vi } from "vite-plus/test"

import { estimateManagedExecution } from "@/integrations/autumn/managed-execution-cost"
import { trackManagedExecution } from "@/integrations/autumn/managed-execution"
import { HOSTED_CREDIT_FEATURE_ID } from "@/integrations/autumn/config"
import type { ProviderOutcome } from "@/workflows/document-results"

function parsed(
  input: Partial<Extract<ProviderOutcome, { status: "parsed" }>> &
    Pick<Extract<ProviderOutcome, { status: "parsed" }>, "provider">
): Extract<ProviderOutcome, { status: "parsed" }> {
  return {
    durationMs: 1_000,
    executionId: "execution-test",
    pageCount: 1,
    resultKey: "jobs/test/result.json",
    status: "parsed",
    ...input,
  }
}

describe("managed execution pricing", () => {
  test("uses provider-reported dollar cost when available", () => {
    const estimate = estimateManagedExecution(
      parsed({
        pageCount: 10,
        provider: "datalab",
        usage: { costUsd: 0.04, pages: 10 },
      })
    )

    expect(estimate?.credits).toBeCloseTo(44.275)
    expect(estimate?.rawCostUsd).toBeCloseTo(0.04025)
  })

  test("converts LlamaParse credits into upstream cost", () => {
    const estimate = estimateManagedExecution(
      parsed({
        pageCount: 10,
        provider: "llamaparse",
        usage: { credits: 30, pages: 10 },
      })
    )

    expect(estimate?.credits).toBeCloseTo(41.525)
    expect(estimate?.rawCostUsd).toBeCloseTo(0.03775)
  })

  test("prices Mistral OCR from processed pages", () => {
    const estimate = estimateManagedExecution(
      parsed({
        pageCount: 10,
        provider: "mistral-ocr",
        usage: { costUsd: 0.04, pages: 10 },
      })
    )

    expect(estimate?.credits).toBeCloseTo(44.275)
    expect(estimate?.rawCostUsd).toBeCloseTo(0.04025)
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
    expect(estimate.rawCostUsd).toBeCloseTo(0.0004556)
    expect(estimate.credits).toBeCloseTo(0.50116)
  })

  test("records idempotent provider events", async () => {
    const track = vi.fn().mockResolvedValue({})

    await expect(
      trackManagedExecution(
        { track },
        {
          jobId: "job-123",
          providers: [
            parsed({
              pageCount: 2,
              provider: "mistral-ocr",
              usage: { costUsd: 0.008, pages: 2 },
            }),
            {
              durationMs: 100,
              error: { message: "failed" },
              executionId: "execution-failed",
              provider: "datalab",
              status: "failed",
            },
          ],
          userId: "user-123",
        }
      )
    ).resolves.toEqual({ trackedProviders: 1, unpricedProviders: [] })

    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "user-123",
        featureId: HOSTED_CREDIT_FEATURE_ID,
        overageBehavior: "overflow",
      }),
      {
        headers: {
          "Idempotency-Key": "document-execution:execution-test",
        },
      }
    )
    expect(track.mock.calls[0]?.[0].value).toBeCloseTo(9.075)
  })
})
