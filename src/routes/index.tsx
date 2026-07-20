import { ArrowRight } from "@phosphor-icons/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import type { ProviderId } from "@file_router/sdk/catalog"

import { PublicPageShell } from "@/components/public-page-shell"
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

const providers = [
  {
    darkLogo: "/providers/llamaparse-dark.svg",
    id: "llamaparse",
    label: "LlamaParse",
    logo: "/providers/llamaparse.svg",
  },
  {
    darkLogo: "/providers/datalab-dark.svg",
    id: "datalab",
    label: "Datalab",
    logo: "/providers/datalab.svg",
  },
  {
    darkLogo: "/providers/mistral-dark.png",
    id: "mistral-ocr",
    label: "Mistral OCR",
    logo: "/providers/mistral.png",
  },
] as const satisfies ReadonlyArray<{ id: ProviderId } & Record<string, string>>

function App() {
  const { session } = Route.useRouteContext()

  return (
    <PublicPageShell>
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 pt-20 pb-16 text-center md:pt-28 md:pb-20">
        <div className="flex w-full min-w-0 flex-col items-center">
          <h1 className="max-w-5xl text-4xl font-medium tracking-normal text-balance md:text-6xl lg:text-7xl">
            Durable document parsing across providers.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground md:text-xl">
            One TypeScript SDK, CLI, and API for reliable document jobs,
            normalized results, and provider decisions based on quality,
            latency, and cost.
          </p>

          <div className="mt-9 flex w-full max-w-[21rem] flex-col items-center gap-4">
            <div className="grid w-full gap-3 sm:grid-cols-2">
              {session ? (
                <Link
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-foreground px-5 text-sm font-normal text-background transition-opacity hover:opacity-80"
                  to="/dashboard"
                >
                  Dashboard
                  <ArrowRight className="size-4" weight="bold" />
                </Link>
              ) : (
                <Link
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-foreground px-5 text-sm font-normal text-background transition-opacity hover:opacity-80"
                  search={{ redirect: "/dashboard" }}
                  to="/sign-in"
                >
                  Start for free
                  <ArrowRight className="size-4" weight="bold" />
                </Link>
              )}
              <TalkToTeamButton />
            </div>
            <code className="inline-flex min-h-10 w-full items-center justify-center rounded-sm border border-border bg-card px-4 py-2 font-mono text-sm text-muted-foreground">
              npx @file_router/cli@latest login
            </code>
          </div>

          <p className="mt-12 text-xs font-normal text-muted-foreground uppercase">
            Available today
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
            {providers.map((provider) => (
              <div className="inline-flex items-center" key={provider.label}>
                <img
                  alt={provider.label}
                  className="h-6 w-auto max-w-40 dark:hidden"
                  src={provider.logo}
                />
                <img
                  alt={provider.label}
                  className="hidden h-6 w-auto max-w-40 dark:block"
                  src={provider.darkLogo}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border">
        <div className="mx-auto grid w-full max-w-6xl px-5 md:grid-cols-3">
          {foundations.map((foundation, index) => (
            <article
              className="py-8 md:px-8 md:py-10 md:not-first:border-l md:not-first:border-border md:first:pl-0 md:last:pr-0"
              key={foundation.title}
            >
              <p className="font-mono text-xs text-muted-foreground">
                0{index + 1}
              </p>
              <h2 className="mt-4 text-lg font-medium">{foundation.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {foundation.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24"
        id="why-filerouter"
      >
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-sm text-muted-foreground">What FileRouter is</p>
            <h2 className="mt-3 text-3xl font-medium text-balance md:text-4xl">
              The control plane between your application and document parsers.
            </h2>
          </div>
          <div className="grid gap-5 text-base leading-7 text-muted-foreground">
            <p>
              Every document provider has different input rules, options,
              asynchronous job APIs, polling behavior, errors, and output
              shapes. Supporting several providers usually means rebuilding the
              same pipeline several times.
            </p>
            <p>
              FileRouter absorbs those differences behind one input and result
              contract. Choose one parser today, compare it against others on
              your own documents, and switch later without replacing the rest of
              your application.
            </p>
            <a
              className="w-fit text-sm text-foreground underline underline-offset-4"
              href="https://docs.filerouter.dev/introduction"
            >
              Read how FileRouter works
            </a>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/25">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
          <div className="max-w-3xl">
            <p className="text-sm text-muted-foreground">
              Operational leverage
            </p>
            <h2 className="mt-3 text-3xl font-medium text-balance md:text-4xl">
              Make provider tradeoffs visible before you automate them.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              FileRouter gives every provider run a consistent operational
              envelope. Use the signals that exist today to choose deliberately
              instead of hard-coding the first integration forever.
            </p>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {operationalLeverage.map((item) => (
              <article className="bg-background p-6" key={item.title}>
                <h3 className="text-lg font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-muted/25" id="sdk">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-sm font-normal text-muted-foreground">
              TypeScript SDK
            </p>
            <h2 className="mt-3 text-3xl font-medium md:text-4xl">
              Start with one provider. Compare when you need to.
            </h2>
            <p className="mt-4 max-w-lg leading-7 text-muted-foreground">
              Keep provider-specific behavior behind a stable input and result
              contract.
            </p>
          </div>

          <SdkExample />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-normal text-muted-foreground">
            Processing modes
          </p>
          <h2 className="mt-3 text-3xl font-medium md:text-4xl">
            Choose how documents move.
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Use FileRouter-hosted processing for managed jobs, or call providers
            directly with your own keys.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-lg border border-border p-6">
            <p className="font-mono text-xs text-muted-foreground uppercase">
              Hosted
            </p>
            <h3 className="mt-4 text-xl font-medium">
              File → FileRouter → provider
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              FileRouter manages the upload, durable provider polling, result,
              and cleanup behind one API key.
            </p>
          </article>
          <article className="rounded-lg border border-border p-6">
            <p className="font-mono text-xs text-muted-foreground uppercase">
              Direct / BYOK
            </p>
            <h3 className="mt-4 text-xl font-medium">File → provider</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The SDK calls the selected provider with credentials from your
              environment. FileRouter does not receive that request.
            </p>
          </article>
        </div>
      </section>

      <section className="border-y border-border bg-muted/25">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <div>
              <p className="text-sm text-muted-foreground">
                Near-term direction
              </p>
              <h2 className="mt-3 text-3xl font-medium text-balance md:text-4xl">
                From provider adapters to document routing.
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                Automatic provider selection and failover are not part of the
                current API. They are the next layer FileRouter is designed to
                support.
              </p>
            </div>

            <ol className="grid gap-6 sm:grid-cols-2">
              {nearTermDirection.map((item, index) => (
                <li className="border-t border-border pt-5" key={item.title}>
                  <p className="font-mono text-xs text-muted-foreground">
                    0{index + 1}
                  </p>
                  <h3 className="mt-3 text-lg font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-5 py-16 md:py-24">
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground">Questions and answers</p>
          <h2 className="mt-3 text-3xl font-medium md:text-4xl">
            FileRouter, directly answered.
          </h2>
        </div>

        <div className="mt-8 divide-y divide-border border-y border-border">
          {homeFaqs.map((item) => (
            <details className="group py-5" key={item.question}>
              <summary className="cursor-pointer list-none pr-8 text-lg font-medium marker:hidden">
                {item.question}
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-14 bg-muted/45 py-16 text-center sm:mt-20 sm:py-24 dark:bg-white/[0.055]">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6">
          <h2 className="mx-auto max-w-3xl text-4xl font-medium tracking-tight text-balance sm:text-6xl">
            Stop rebuilding document integrations.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Start with one API and keep the freedom to switch.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild className="h-12 px-6 font-normal" size="lg">
              {session ? (
                <Link to="/dashboard">Open dashboard</Link>
              ) : (
                <Link search={{ redirect: "/dashboard" }} to="/sign-in">
                  Start for free
                </Link>
              )}
            </Button>
            <Button
              asChild
              className="h-12 px-6 font-normal"
              size="lg"
              variant="outline"
            >
              <a href="https://github.com/ThinkEx-OSS/filerouter">
                View GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>
    </PublicPageShell>
  )
}

function TalkToTeamButton() {
  const [opening, setOpening] = useState(false)

  async function openCalendar() {
    setOpening(true)

    try {
      const { getCalApi } = await import("@calcom/embed-react")
      const cal = await getCalApi({ namespace: "30min" })
      cal("ui", { hideEventTypeDetails: false, layout: "month_view" })
      cal("modal", {
        calLink: "thinkex-team-vuzyak/30min",
        config: {
          layout: "month_view",
          useSlotsViewOnSmallScreen: "true",
        },
      })
    } catch {
      window.location.assign("https://cal.com/thinkex-team-vuzyak/30min")
    } finally {
      setOpening(false)
    }
  }

  return (
    <button
      className="inline-flex h-11 w-full items-center justify-center rounded-sm border border-border bg-background px-5 text-sm font-normal transition-colors hover:bg-muted"
      disabled={opening}
      onClick={openCalendar}
      type="button"
    >
      {opening ? "Opening…" : "Talk to the team"}
    </button>
  )
}

const foundations = [
  {
    description:
      "Send files, URLs, blobs, buffers, or streams through the same typed interface.",
    title: "One input contract",
  },
  {
    description:
      "Hosted jobs handle provider submission, polling, timeouts, storage, and cleanup.",
    title: "Durable execution",
  },
  {
    description:
      "Run the same document across providers and receive consistently shaped results.",
    title: "Built-in comparison",
  },
] as const

const operationalLeverage = [
  {
    title: "Durability",
    description:
      "Hosted jobs persist state while FileRouter submits, polls, times out, stores results, and cleans up independently of the original HTTP request.",
  },
  {
    title: "Reliability",
    description:
      "Idempotent job creation prevents duplicate submissions, while comparisons preserve each provider's success, failure, or unsupported outcome.",
  },
  {
    title: "Latency",
    description:
      "Normalized timing records overall and per-provider duration so decisions can use measurements from your real document workload.",
  },
  {
    title: "Cost",
    description:
      "Request only the outputs and pages you need, avoid unsupported calls, and retain provider-reported cost, credit, and page usage when available.",
  },
  {
    title: "Quality",
    description:
      "Run identical input across providers concurrently and inspect the resulting Markdown, pages, tables, images, warnings, and native data side by side.",
  },
  {
    title: "Portability",
    description:
      "Keep provider-specific options namespaced behind one typed contract, then change the selected provider without rebuilding the surrounding pipeline.",
  },
] as const

const nearTermDirection = [
  {
    title: "Measure",
    description:
      "Build evidence from latency, failures, usage, and output comparisons across real document types.",
  },
  {
    title: "Route",
    description:
      "Turn explicit priorities such as accuracy, reliability, latency, or cost into provider-selection policies.",
  },
  {
    title: "Recover",
    description:
      "Add controlled retries and provider fallback while preserving the same application-facing contract.",
  },
  {
    title: "Expand",
    description:
      "Add provider adapters without forcing applications to take on another upload, polling, and normalization stack.",
  },
] as const

const homeFaqs = [
  {
    question: "What is FileRouter?",
    answer:
      "FileRouter is a routing and execution layer over document parsers. Providers perform the parsing; FileRouter standardizes inputs, durable jobs, comparison, errors, timing, usage, and results across them.",
  },
  {
    question: "Can I switch document parsing providers without a rewrite?",
    answer:
      "Yes. Supported providers share the same FileRouter input and result contracts. Provider-native settings remain available under namespaced providerOptions, so changing providers does not require replacing the surrounding document pipeline.",
  },
  {
    question:
      "Does FileRouter automatically choose the cheapest or fastest provider?",
    answer:
      "Not today. The current API uses explicit provider selection and exposes comparison, timing, failures, and provider-reported usage. Policy-based automatic routing is the near-term direction.",
  },
  {
    question: "What makes FileRouter jobs durable?",
    answer:
      "Hosted work is persisted as a background job with queued, running, complete, or failed state. Workflow steps handle provider submission and polling independently of the original request, and idempotency keys make creation safely retryable.",
  },
  {
    question: "How can FileRouter reduce document parsing cost?",
    answer:
      "Today it prevents duplicate hosted submissions, rejects unsupported output requests before provider I/O, supports page and output selection, and makes providers comparable on your workload. Automatic cost-aware routing is planned rather than claimed as current behavior.",
  },
  {
    question: "Does FileRouter receive documents in direct or BYOK mode?",
    answer:
      "No. Direct or BYOK requests go from your environment to the selected provider. FileRouter does not receive the document, provider key, or result, although the selected provider still receives and processes the document.",
  },
] as const

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
    {
      "@type": "FAQPage",
      mainEntity: homeFaqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ],
} as const
