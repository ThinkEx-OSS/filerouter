import type { Balance, Customer } from "autumn-js"
import { describe, expect, test, vi } from "vite-plus/test"

import {
  createHostedCreditCheckout,
  getHostedBillingSummary,
  requireHostedCredit,
} from "@/integrations/autumn/billing.server"
import type {
  AutumnAccount,
  AutumnBillingClient,
} from "@/integrations/autumn/billing.server"
import {
  HOSTED_CREDIT_FEATURE_ID,
  HOSTED_CREDIT_TOP_UP_PLAN_ID,
  HOSTED_TOP_UP_CREDITS,
} from "@/integrations/autumn/config"

const account: AutumnAccount = {
  email: "dev@example.com",
  id: "user-123",
  name: "Developer",
}
const env = {
  AUTUMN_SECRET_KEY: "test",
  HOSTED_BILLING_ENABLED: "true",
}

describe("hosted billing", () => {
  test("summarizes the account-level hosted credit balance", async () => {
    const client = autumnClient({
      [HOSTED_CREDIT_FEATURE_ID]: balance({
        remaining: 12_345.5,
      }),
    })

    await expect(
      getHostedBillingSummary(env, account, client)
    ).resolves.toMatchObject({
      enabled: true,
      includedCredits: 5_000,
      remainingCredits: 12_345.5,
      topUpCredits: 10_000,
      topUpPriceUsd: 10,
    })
  })

  test("rejects hosted work when the account has no credits", async () => {
    const client = autumnClient({
      [HOSTED_CREDIT_FEATURE_ID]: balance({ remaining: 0 }),
    })
    vi.mocked(client.check).mockResolvedValue({ allowed: false })

    await expect(
      requireHostedCredit(env, account, client)
    ).rejects.toMatchObject({ code: "insufficient_credits", status: 402 })
  })

  test("defers the top-up grant until Stripe confirms payment", async () => {
    const client = autumnClient({})
    vi.mocked(client.billing.attach).mockResolvedValue({
      paymentUrl: "https://checkout.stripe.com/test",
    })

    await expect(
      createHostedCreditCheckout(
        env,
        account,
        "https://filerouter.dev/dashboard?credits=added",
        client
      )
    ).resolves.toBe("https://checkout.stripe.com/test")
    expect(client.billing.attach).toHaveBeenCalledWith({
      customerId: account.id,
      featureQuantities: [
        {
          featureId: HOSTED_CREDIT_FEATURE_ID,
          quantity: HOSTED_TOP_UP_CREDITS,
        },
      ],
      metadata: { product: "filerouter", purchase: "hosted_credits" },
      planId: HOSTED_CREDIT_TOP_UP_PLAN_ID,
      redirectMode: "always",
      successUrl: "https://filerouter.dev/dashboard?credits=added",
    })
  })
})

function autumnClient(balances: Record<string, Balance>): AutumnBillingClient {
  return {
    billing: { attach: vi.fn() },
    check: vi.fn().mockResolvedValue({ allowed: true }),
    customers: {
      getOrCreate: vi.fn().mockResolvedValue({ balances } as Customer),
    },
  }
}

function balance(overrides: Partial<Balance>): Balance {
  return {
    breakdown: [],
    featureId: HOSTED_CREDIT_FEATURE_ID,
    granted: 5_000,
    maxPurchase: null,
    nextResetAt: null,
    overageAllowed: false,
    remaining: 5_000,
    rollovers: [],
    unlimited: false,
    usage: 0,
    ...overrides,
  }
}
