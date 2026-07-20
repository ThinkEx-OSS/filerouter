import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { AppNavbar } from "@/components/app-navbar"
import { GitHubIcon } from "@/components/community-links"
import { ModeToggle } from "@/components/mode-toggle"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { getAuthSessionQueryOptions } from "@/lib/session-query"

export const LEGAL_LAST_UPDATED = "July 20, 2026"

interface LegalSection {
  body?: string
  items?: Array<string>
  title: string
}

export interface LegalDocument {
  description: string
  sections: Array<LegalSection>
  title: string
}

export function LegalPage({ document }: { document: LegalDocument }) {
  const { data: session } = useQuery(getAuthSessionQueryOptions())

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <AppNavbar>
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

      <main className="flex-1">
        <article className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
          <p className="text-sm text-muted-foreground">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
          <h1 className="mt-3 text-4xl font-medium tracking-tight text-balance sm:text-5xl">
            {document.title}
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
            {document.description}
          </p>

          <div className="mt-12 space-y-10">
            {document.sections.map((section) => (
              <section className="space-y-3" key={section.title}>
                <h2 className="text-xl font-medium tracking-tight">
                  {section.title}
                </h2>
                {section.body ? (
                  <p className="text-sm leading-7 text-muted-foreground">
                    {section.body}
                  </p>
                ) : null}
                {section.items ? (
                  <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      </main>

      <SiteFooter />
    </div>
  )
}
