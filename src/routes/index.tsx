import { ArrowRight } from "@phosphor-icons/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import type { ProviderId } from "@file_router/sdk/catalog"

import { FileRouterBrand } from "@/components/file-router-brand"
import { FileRouterLogo } from "@/components/file-router-logo"
import { ModeToggle } from "@/components/mode-toggle"

export const Route = createFileRoute("/")({ component: App })

const providers = [
  {
    bestFor: "Layout-aware PDF parsing, scans, tables, and structured output.",
    darkLogo: "/providers/llamaparse-dark.svg",
    id: "llamaparse",
    label: "LlamaParse",
    logo: "/providers/llamaparse.svg",
  },
  {
    bestFor: "Document conversion powered by Marker, Surya, and Chandra.",
    darkLogo: "/providers/datalab-dark.svg",
    id: "datalab",
    label: "Datalab",
    logo: "/providers/datalab.svg",
  },
  {
    bestFor: "Fast OCR with markdown-structured document output.",
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
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border/70">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <FileRouterBrand />

          <div className="flex items-center gap-2">
            <ModeToggle className="size-9" />
            <a
              className="hidden h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex"
              href="https://github.com/ThinkEx-OSS/filerouter"
            >
              <img
                alt=""
                className="size-4 dark:hidden"
                src="/github-mark.svg"
              />
              <img
                alt=""
                className="hidden size-4 dark:block"
                src="/github-mark-dark.svg"
              />
              GitHub
            </a>
          </div>
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 pt-20 pb-16 text-center md:pt-28 md:pb-20">
        <h1 className="max-w-4xl text-4xl font-medium tracking-normal text-balance md:text-6xl">
          One interface for document parsing providers.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-balance text-muted-foreground md:text-xl">
          Parse, compare, and switch providers without rewriting your
          application.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            search={{ redirect: "/dashboard" }}
            to="/sign-in"
          >
            Get started
            <ArrowRight className="size-4" weight="bold" />
          </Link>
          <code className="inline-flex h-11 items-center rounded-md border border-border px-4 font-mono text-sm">
            pnpm add @file_router/sdk
          </code>
        </div>

        <p className="mt-12 text-xs font-medium text-muted-foreground uppercase">
          Current and upcoming providers
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
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

      <section className="border-y border-border bg-muted/25" id="sdk">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-sm font-medium text-primary">TypeScript SDK</p>
            <h2 className="mt-3 text-3xl font-medium md:text-4xl">
              Change providers with one option.
            </h2>
            <p className="mt-4 max-w-lg leading-7 text-muted-foreground">
              Use FileRouter credentials by default, or bring provider keys for
              local processing.
            </p>
          </div>

          <pre className="overflow-x-auto rounded-lg border border-border bg-card p-5 text-left font-mono text-sm leading-7 md:p-7">
            <code>{`import { FileRouterClient } from "@file_router/sdk"

const client = new FileRouterClient()

const result = await client.parse(file, {
  provider: "llamaparse",
  outputs: ["markdown", "tables"],
})`}</code>
          </pre>
        </div>
      </section>

      <section
        className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20"
        id="providers"
      >
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">Providers</p>
          <h2 className="mt-3 text-3xl font-medium md:text-4xl">
            Three adapters for the first release.
          </h2>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {providers.map((provider) => (
            <article
              className="rounded-lg border border-border p-5"
              key={provider.label}
            >
              <h3 className="text-lg font-medium">{provider.label}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {provider.bestFor}
              </p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-5 px-5 py-8">
          <div className="flex items-center gap-3">
            <FileRouterLogo className="h-7 w-auto" />
            <span className="font-medium">FileRouter</span>
          </div>
          <a
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            href="https://github.com/ThinkEx-OSS/filerouter"
          >
            Open source on GitHub
          </a>
        </div>
      </footer>
    </main>
  )
}
