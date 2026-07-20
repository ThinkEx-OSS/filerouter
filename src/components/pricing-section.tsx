import { Check } from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const pricingPlans = [
  {
    cta: "Read the docs",
    description: "Run providers from your environment with your own keys.",
    emphasized: false,
    features: [
      "No FileRouter usage fee",
      "Provider-native billing",
      "Typed SDK and CLI",
      "Parse and compare locally",
    ],
    id: "direct",
    name: "Direct (BYOK)",
    price: "$0",
  },
  {
    cta: "Start for free",
    description: "Let FileRouter handle the durable execution layer.",
    emphasized: true,
    features: [
      "One FileRouter API key",
      "Durable jobs and retries",
      "Managed uploads and cleanup",
      "Normalized provider results",
    ],
    id: "hosted",
    name: "Hosted",
    price: "Coming soon",
  },
] as const

export function PricingSection() {
  return (
    <section aria-labelledby="pricing-heading" id="pricing">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
        <p className="text-sm font-normal text-muted-foreground">Pricing</p>
        <h2
          className="mt-3 max-w-3xl text-3xl font-medium md:text-4xl"
          id="pricing-heading"
        >
          Your keys or managed execution.
        </h2>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
          Call providers directly with your own keys, or let FileRouter handle
          uploads, polling, retries, and cleanup.
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {pricingPlans.map((plan) => (
            <article
              className={cn(
                "flex flex-col border border-border p-6",
                plan.emphasized && "border-foreground/30"
              )}
              key={plan.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-medium">{plan.name}</h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                    {plan.description}
                  </p>
                </div>
                <p className="shrink-0 text-right text-lg font-medium">
                  {plan.price}
                </p>
              </div>

              <ul className="mt-6 grid gap-3 text-sm text-muted-foreground">
                {plan.features.map((feature) => (
                  <li className="flex items-center gap-2" key={feature}>
                    <Check
                      aria-hidden="true"
                      className="size-4 shrink-0 text-primary"
                      weight="bold"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className="mt-8 h-10 w-full text-sm font-normal"
                variant={plan.emphasized ? "default" : "outline"}
              >
                {plan.id === "hosted" ? (
                  <Link search={{ redirect: "/dashboard" }} to="/sign-in">
                    {plan.cta}
                  </Link>
                ) : (
                  <a href="https://docs.filerouter.dev">{plan.cta}</a>
                )}
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
