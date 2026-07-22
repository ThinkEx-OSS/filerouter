import { ArrowSquareOut, Coins } from "@phosphor-icons/react"
import { useMutation, useQuery } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import {
  getBillingSummary,
  startCreditCheckout,
} from "@/integrations/autumn/billing.functions"

export function DashboardBilling() {
  const summary = useQuery({
    queryFn: () => getBillingSummary(),
    queryKey: ["hosted-billing-summary"],
    staleTime: 30_000,
  })
  const checkout = useMutation({
    mutationFn: () => startCreditCheckout(),
    onSuccess: ({ paymentUrl }) => window.location.assign(paymentUrl),
  })

  if (summary.data && !summary.data.enabled) {
    return null
  }

  const remaining = summary.data
    ? summary.data.remainingCredits === null
      ? "Unlimited"
      : formatCredits(summary.data.remainingCredits)
    : "—"

  return (
    <section aria-labelledby="credit-balance-title">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Coins className="size-4" weight="bold" />
        <h2 id="credit-balance-title">Credit balance</h2>
      </div>
      <p className="mt-3 font-mono text-2xl font-medium tabular-nums">
        {remaining}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {summary.data
          ? `${formatCredits(summary.data.includedCredits)} free credits each month. Purchased credits never expire.`
          : "Loading balance…"}
      </p>
      <Button
        className="mt-4 w-full justify-between"
        disabled={!summary.data || checkout.isPending}
        onClick={() => checkout.mutate()}
        size="sm"
        variant="outline"
      >
        {checkout.isPending
          ? "Opening checkout…"
          : summary.data
            ? `Add ${formatCredits(summary.data.topUpCredits)} · $${summary.data.topUpPriceUsd}`
            : "Add credits"}
        <ArrowSquareOut className="size-4" weight="bold" />
      </Button>
      {checkout.isError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          Could not open checkout. Try again.
        </p>
      ) : null}
    </section>
  )
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value)
}
