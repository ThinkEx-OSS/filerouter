import { ArrowRight } from "@phosphor-icons/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import type { ProviderId } from "@file_router/sdk/catalog"

import { AppNavbar } from "@/components/app-navbar"
import { GitHubIcon } from "@/components/community-links"
import { ModeToggle } from "@/components/mode-toggle"
import { SiteFooter } from "@/components/site-footer"
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

const providerLogos = [
  providers[0],
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
  providers[1],
  providers[2],
] as const

function App() {
  const { session } = Route.useRouteContext()

  return (
    <main className="min-h-svh bg-background text-foreground">
      <AppNavbar>
        <Button asChild className="hidden sm:inline-flex" variant="ghost">
          <a href="https://docs.filerouter.dev">Docs</a>
        </Button>
        <ModeToggle className="size-9" />
        <Button asChild className="hidden sm:inline-flex" variant="outline">
          <a href="https://github.com/ThinkEx-OSS/filerouter">
            <GitHubIcon className="size-4" />
            GitHub
          </a>
        </Button>
        <Button asChild>
          {session ? (
            <Link to="/dashboard">Dashboard</Link>
          ) : (
            <Link search={{ redirect: "/dashboard" }} to="/sign-in">
              Get started
            </Link>
          )}
        </Button>
      </AppNavbar>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-start px-5 pt-20 pb-16 text-left md:pt-28 md:pb-20">
        <h1 className="max-w-5xl text-4xl font-medium tracking-normal text-balance md:text-6xl lg:text-7xl">
          One API for document parsing.
        </h1>
        <p className="mt-6 max-w-4xl text-lg leading-8 text-muted-foreground md:text-xl">
          Parse, compare, and switch providers without rebuilding uploads,
          polling, or result handling.
        </p>

        <div className="mt-9 flex w-full max-w-sm flex-col items-start gap-4">
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
          Adapters for
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-start gap-x-10 gap-y-5">
          {providerLogos.map((provider) => (
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

      <section className="border-y border-border bg-muted/25" id="sdk">
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

      <SiteFooter />
    </main>
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
