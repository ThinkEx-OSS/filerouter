import { ArrowSquareOut, Coins, Info } from "@phosphor-icons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Popover } from "radix-ui"

import { Button } from "@/components/ui/button"
import {
  getBillingSummary,
  startCreditCheckout,
} from "@/integrations/autumn/billing.functions"

const creditFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
})

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
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              aria-label="How FileRouter credits work"
              className="inline-flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              type="button"
            >
              <Info className="size-4" weight="bold" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              className="z-50 w-72 border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
              sideOffset={8}
            >
              <p className="text-sm font-medium">How credits work</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                1,000 credits equal $1 of hosted usage. Usage varies by parser,
                pages, and processing time. Comparisons use credits for each
                successful provider. Direct requests use no FileRouter credits.
              </p>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
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
  return creditFormatter.format(value)
}
