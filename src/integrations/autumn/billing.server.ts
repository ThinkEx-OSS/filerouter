import type { Balance, Customer } from "autumn-js"
import { eq } from "drizzle-orm"

import { user } from "@/db/schema"
import { createDb } from "@/db/server"
import {
  HOSTED_CREDIT_FEATURE_ID,
  HOSTED_CREDIT_TOP_UP_PLAN_ID,
  HOSTED_FREE_PLAN_ID,
  HOSTED_MONTHLY_CREDITS,
  HOSTED_TOP_UP_CREDITS,
  HOSTED_TOP_UP_PRICE_USD,
} from "@/integrations/autumn/config"
import { createAutumnClient } from "@/integrations/autumn/client.server"
import { HttpError } from "@/lib/http.server"

export interface AutumnAccount {
  email: string
  id: string
  name: string
}

interface AutumnBillingEnv {
  AUTUMN_SECRET_KEY?: string
  HOSTED_BILLING_ENABLED?: string
}

export interface AutumnBillingClient {
  billing: {
    attach: (request: {
      customerId: string
      featureQuantities: Array<{ featureId: string; quantity: number }>
      metadata: Record<string, string>
      planId: string
      redirectMode: "always"
      successUrl: string
    }) => Promise<{ paymentUrl: string | null }>
  }
  check: (request: {
    customerId: string
    featureId: string
    requiredBalance: number
  }) => Promise<{ allowed: boolean }>
  customers: {
    getOrCreate: (request: {
      autoEnablePlanId: string
      customerId: string
      email: string
      metadata: Record<string, string>
      name: string
    }) => Promise<Customer>
  }
}

export interface HostedBillingSummary {
  enabled: boolean
  includedCredits: number
  remainingCredits: number | null
  topUpCredits: number
  topUpPriceUsd: number
}

export async function getHostedBillingSummary(
  env: AutumnBillingEnv,
  account: AutumnAccount,
  client: AutumnBillingClient | undefined = createAutumnClient(env)
): Promise<HostedBillingSummary> {
  if (!client) {
    return emptySummary()
  }

  const customer = await ensureAutumnCustomer(client, account)
  const balance = customer.balances[HOSTED_CREDIT_FEATURE_ID]
  return {
    enabled: true,
    includedCredits: HOSTED_MONTHLY_CREDITS,
    remainingCredits: normalizeCredits(balance),
    topUpCredits: HOSTED_TOP_UP_CREDITS,
    topUpPriceUsd: HOSTED_TOP_UP_PRICE_USD,
  }
}

export async function requireHostedCredit(
  env: AutumnBillingEnv,
  account: AutumnAccount,
  client: AutumnBillingClient | undefined = createAutumnClient(env)
): Promise<void> {
  if (!client) {
    return
  }

  await ensureAutumnCustomer(client, account)
  const access = await client.check({
    customerId: account.id,
    featureId: HOSTED_CREDIT_FEATURE_ID,
    requiredBalance: 1,
  })
  if (!access.allowed) {
    throw new HttpError(
      402,
      "You're out of credits. Add credits in the dashboard to continue.",
      { code: "insufficient_credits" }
    )
  }
}

export async function requireHostedCreditForUser(
  env: AutumnBillingEnv & { DB: D1Database },
  userId: string,
  client: AutumnBillingClient | undefined = createAutumnClient(env)
): Promise<void> {
  if (!client) {
    return
  }
  const account = await findAutumnAccount(env.DB, userId)
  await requireHostedCredit(env, account, client)
}

export async function createHostedCreditCheckout(
  env: AutumnBillingEnv,
  account: AutumnAccount,
  successUrl: string,
  client: AutumnBillingClient | undefined = createAutumnClient(env)
): Promise<string> {
  if (!client) {
    throw new Error("Hosted billing is not enabled.")
  }

  await ensureAutumnCustomer(client, account)
  const checkout = await client.billing.attach({
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
    successUrl,
  })
  if (!checkout.paymentUrl) {
    throw new Error("Autumn did not return a checkout URL.")
  }
  return checkout.paymentUrl
}

export function ensureAutumnCustomer(
  client: Pick<AutumnBillingClient, "customers">,
  account: AutumnAccount
): Promise<Customer> {
  return client.customers.getOrCreate({
    autoEnablePlanId: HOSTED_FREE_PLAN_ID,
    customerId: account.id,
    email: account.email,
    metadata: { account_type: "developer", product: "filerouter" },
    name: account.name,
  })
}

export async function findAutumnAccount(
  database: D1Database,
  userId: string
): Promise<AutumnAccount> {
  const account = await createDb(database)
    .select({ email: user.email, id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .get()
  if (!account) {
    throw new Error(`Cannot find Autumn account for user ${userId}.`)
  }
  return account
}

function emptySummary(): HostedBillingSummary {
  return {
    enabled: false,
    includedCredits: HOSTED_MONTHLY_CREDITS,
    remainingCredits: 0,
    topUpCredits: HOSTED_TOP_UP_CREDITS,
    topUpPriceUsd: HOSTED_TOP_UP_PRICE_USD,
  }
}

function normalizeCredits(balance: Balance | undefined): number | null {
  if (balance?.unlimited) {
    return null
  }
  if (!balance) {
    return 0
  }
  return Math.max(0, balance.remaining)
}
