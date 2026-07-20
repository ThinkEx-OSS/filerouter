import { ArrowRight } from "@phosphor-icons/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect } from "react"

import { LatestBlogSection } from "@/components/blog/latest-blog-section"
import { BenchmarkSection } from "@/components/benchmark-section"
import { DitherButton } from "@/components/dither-kit/button"
import { PricingSection } from "@/components/pricing-section"
import { PublicPageShell } from "@/components/public-page-shell"
import { availableProviders, RoutingCanvas } from "@/components/routing-canvas"
import { SdkExample } from "@/components/sdk-example"
import { Button } from "@/components/ui/button"
import { getAuthSessionQueryOptions } from "@/lib/session-query"

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      getAuthSessionQueryOptions()
    )

    return { session }
  },
  head: () => ({
    meta: [
      { title: "FileRouter — Durable document parsing across providers" },
      {
        name: "description",
        content:
          "Run durable document parsing across providers with one TypeScript SDK, CLI, and API. Compare quality, latency, reliability, and cost without rebuilding integrations.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "FileRouter" },
      {
        property: "og:title",
        content: "FileRouter — Durable document parsing across providers",
      },
      {
        property: "og:description",
        content:
          "One durable control plane for document parsing across providers, with normalized results and built-in comparison.",
      },
      { property: "og:url", content: "https://filerouter.dev/" },
      { name: "twitter:card", content: "summary" },
      {
        name: "twitter:title",
        content: "FileRouter — Durable document parsing across providers",
      },
      {
        name: "twitter:description",
        content:
          "One durable control plane for document parsing across providers, with normalized results and built-in comparison.",
      },
    ],
    links: [{ rel: "canonical", href: "https://filerouter.dev/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(homeStructuredData),
      },
    ],
  }),
  component: App,
})

const providerLogos = [
  availableProviders[0],
  {
    darkLogo: "/providers/firecrawl-dark.svg",
    label: "Firecrawl",
    logo: "/providers/firecrawl.svg",
  },
  {
    darkLogo: "/providers/reducto-dark.svg",
    label: "Reducto",
    logo: "/providers/reducto.svg",
  },
  availableProviders[1],
  availableProviders[2],
] as const

function getProviderLogoHeightClass(label: string) {
  if (label === "Firecrawl") return "h-7"
  if (label === "Reducto") return "h-[1.375rem]"
  return "h-6"
}

function App() {
  const { session } = Route.useRouteContext()

  return (
    <PublicPageShell>
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 pt-20 pb-16 text-center md:pt-28 md:pb-20">
        <div className="flex w-full min-w-0 flex-col items-center">
          <h1 className="max-w-5xl text-4xl font-medium tracking-normal text-balance md:text-6xl lg:text-7xl">
            One API for document parsing.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground md:text-xl">
            Durable document parsing across providers: optimized for accuracy,
            reliability, latency, and cost.
          </p>

          <div className="mt-9 flex w-full max-w-[21rem] flex-col items-center gap-4">
            <div className="grid w-full gap-3 sm:grid-cols-2">
              {session ? (
                <Button
                  asChild
                  className="h-11 w-full px-5 text-base font-normal"
                >
                  <Link to="/dashboard">
                    Dashboard
                    <ArrowRight className="size-4" weight="bold" />
                  </Link>
                </Button>
              ) : (
                <DitherButton
                  asChild
                  bloom="aura"
                  className="h-11 w-full px-5 text-base font-normal"
                  color="blue"
                >
                  <Link search={{ redirect: "/dashboard" }} to="/sign-in">
                    Start for free
                    <ArrowRight className="size-4" weight="bold" />
                  </Link>
                </DitherButton>
              )}
              <TalkToTeamButton />
            </div>
            <code className="inline-flex min-h-10 w-full items-center justify-center rounded-none border border-border bg-card px-4 py-2 font-mono text-sm text-muted-foreground">
              npx @file_router/cli@latest login
            </code>
          </div>

          <p className="mt-12 text-xs font-normal text-muted-foreground uppercase">
            Adapters for
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
            {providerLogos.map((provider) => (
              <div className="inline-flex items-center" key={provider.label}>
                <img
                  alt={provider.label}
                  className={`${getProviderLogoHeightClass(provider.label)} w-auto max-w-40 dark:hidden`}
                  src={provider.logo}
                />
                <img
                  alt={provider.label}
                  className={`${getProviderLogoHeightClass(provider.label)} hidden w-auto max-w-40 dark:block`}
                  src={provider.darkLogo}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/25" id="sdk">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-sm font-normal text-muted-foreground">
              TypeScript SDK
            </p>
            <h2 className="mt-3 text-3xl font-medium md:text-4xl">
              Change providers. Keep your pipeline.
            </h2>
            <p className="mt-4 max-w-lg leading-7 text-muted-foreground">
              Parse with one provider or compare several through the same typed
              interface.
            </p>
          </div>

          <SdkExample />
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
          <p className="text-sm font-normal text-muted-foreground">Routing</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-medium md:text-4xl">
            Route every document on your terms.
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Run through FileRouter, call providers directly, or compare routes
            before you switch.
          </p>

          <RoutingCanvas />
        </div>
      </section>

      <BenchmarkSection />

      <PricingSection />

      <LatestBlogSection />

      <section className="py-16 text-center sm:py-24">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6">
          <h2 className="mx-auto max-w-3xl text-4xl font-medium tracking-tight text-balance sm:text-6xl">
            Your pipeline should outlast any provider.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Start with one route. Change it without rebuilding.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            {session ? (
              <Button
                asChild
                className="h-12 px-6 text-base font-normal"
                size="lg"
              >
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <DitherButton
                asChild
                bloom="aura"
                className="h-12 px-6 text-base font-normal"
                color="blue"
              >
                <Link search={{ redirect: "/dashboard" }} to="/sign-in">
                  Start for free
                </Link>
              </DitherButton>
            )}
            <Button
              asChild
              className="h-12 px-6 text-base font-normal"
              size="lg"
              variant="outline"
            >
              <a href="https://docs.filerouter.dev">Read the docs</a>
            </Button>
          </div>
        </div>
      </section>
    </PublicPageShell>
  )
}

function TalkToTeamButton() {
  useEffect(() => {
    async function initializeCalendar() {
      const { getCalApi } = await import("@calcom/embed-react")
      const cal = await getCalApi({ namespace: "15min" })
      cal("ui", {
        cssVarsPerTheme: {
          light: { "cal-brand": "#00BDF7" },
          dark: { "cal-brand": "#00BDF7" },
        },
        hideEventTypeDetails: false,
        layout: "month_view",
      })
    }

    void initializeCalendar()
  }, [])

  return (
    <Button
      className="h-11 w-full px-5 text-base font-normal"
      data-cal-config='{"layout":"month_view","useSlotsViewOnSmallScreen":"true"}'
      data-cal-link="thinkex-team-vuzyak/15min"
      data-cal-namespace="15min"
      type="button"
      variant="outline"
    >
      Talk to the team
    </Button>
  )
}

const homeStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": "https://filerouter.dev/#organization",
      "@type": "Organization",
      name: "ThinkEx Inc.",
      url: "https://thinkex.app/",
      logo: "https://filerouter.dev/icon-512.png",
    },
    {
      "@id": "https://filerouter.dev/#website",
      "@type": "WebSite",
      name: "FileRouter",
      url: "https://filerouter.dev/",
      description:
        "Durable document parsing across providers through one TypeScript SDK, CLI, and hosted API.",
      publisher: { "@id": "https://filerouter.dev/#organization" },
    },
    {
      "@id": "https://filerouter.dev/#sdk",
      "@type": "SoftwareSourceCode",
      name: "@file_router/sdk",
      description:
        "A provider-neutral TypeScript SDK for parsing and comparing documents through hosted or direct provider execution.",
      codeRepository: "https://github.com/ThinkEx-OSS/filerouter",
      license: "https://opensource.org/license/mit",
      programmingLanguage: "TypeScript",
      runtimePlatform: "Node.js 22.14 or newer",
      url: "https://filerouter.dev/",
    },
  ],
} as const
