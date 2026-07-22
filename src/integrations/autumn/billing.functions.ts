import { env as workerEnv } from "cloudflare:workers"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import {
  createHostedCreditCheckout,
  getHostedBillingSummary,
} from "@/integrations/autumn/billing.server"
import { getSessionFromHeaders } from "@/lib/auth-queries.server"

export const getBillingSummary = createServerFn({ method: "GET" }).handler(
  async () => {
    const account = await requireAccount()
    return getHostedBillingSummary(workerEnv, account)
  }
)

export const startCreditCheckout = createServerFn({ method: "POST" }).handler(
  async () => {
    const account = await requireAccount()
    const baseUrl = workerEnv.BETTER_AUTH_URL?.trim()
    if (!baseUrl) {
      throw new Error("BETTER_AUTH_URL is not configured.")
    }
    return {
      paymentUrl: await createHostedCreditCheckout(
        workerEnv,
        account,
        new URL("/dashboard?credits=added", baseUrl).toString()
      ),
    }
  }
)

async function requireAccount() {
  const session = await getSessionFromHeaders(getRequestHeaders())
  if (!session) {
    throw new Error("Authentication required.")
  }
  return {
    email: session.user.email,
    id: session.user.id,
    name: session.user.name,
  }
}
