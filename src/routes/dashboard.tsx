import {
  ArrowUpRight,
  BookOpenText,
  BracketsCurly,
  CloudArrowUp,
  SignOut,
} from "@phosphor-icons/react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useState } from "react"

import { ApiKeys } from "@/components/api-keys"
import { AppNavbar } from "@/components/app-navbar"
import {
  DISCORD_URL,
  DiscordIcon,
  GitHubIcon,
} from "@/components/community-links"
import { DashboardQuickstart } from "@/components/dashboard-quickstart"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { getAuthSessionQueryOptions } from "@/lib/session-query"

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(
      getAuthSessionQueryOptions()
    )

    if (!session) {
      throw redirect({
        to: "/sign-in",
        search: { redirect: location.href },
      })
    }

    return { session }
  },
  head: () => ({
    meta: [
      { title: "Dashboard — FileRouter" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DashboardPage,
})

function DashboardPage() {
  const router = useRouter()
  const { session } = Route.useRouteContext()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    await authClient.signOut()
    await router.invalidate()
    await router.navigate({ to: "/" })
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <AppNavbar>
        <Button
          asChild
          className="hidden h-9 px-3 sm:inline-flex"
          variant="outline"
        >
          <a href="https://docs.filerouter.dev">
            <BookOpenText weight="bold" />
            Docs
          </a>
        </Button>
        <div className="flex items-center gap-1 border-l border-border pl-2">
          <ModeToggle className="size-9" />
          <Button
            aria-label="Sign out"
            className="h-9 px-2 sm:px-3"
            variant="ghost"
            onClick={signOut}
            disabled={signingOut}
          >
            <SignOut weight="bold" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </AppNavbar>

      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex items-center justify-between gap-4 border-b border-border pb-4">
          <h1 className="text-xl font-medium">Get started</h1>
          <p className="truncate text-sm text-muted-foreground">
            {session.user.email}
          </p>
        </div>

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="grid gap-6">
            <DashboardQuickstart />
            <ApiKeys />
          </div>

          <aside className="grid gap-8 lg:sticky lg:top-20">
            <section>
              <h2 className="text-sm font-medium">Documentation</h2>
              <nav
                aria-label="Documentation"
                className="mt-3 border-t border-border"
              >
                {[
                  {
                    href: "https://docs.filerouter.dev/quickstart",
                    icon: BookOpenText,
                    label: "Quickstart",
                  },
                  {
                    href: "https://docs.filerouter.dev/sdk/parse",
                    icon: BracketsCurly,
                    label: "TypeScript SDK",
                  },
                  {
                    href: "https://docs.filerouter.dev/api/overview",
                    icon: CloudArrowUp,
                    label: "API reference",
                  },
                ].map(({ href, icon: Icon, label }) => (
                  <a
                    className="group flex items-center gap-3 border-b border-border py-3 text-sm transition-colors hover:text-primary"
                    href={href}
                    key={label}
                  >
                    <Icon
                      className="size-4 text-muted-foreground"
                      weight="bold"
                    />
                    <span className="flex-1">{label}</span>
                    <ArrowUpRight
                      className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      weight="bold"
                    />
                  </a>
                ))}
              </nav>
            </section>

            <section>
              <h2 className="text-sm font-medium">Community</h2>
              <nav
                aria-label="Community"
                className="mt-3 border-t border-border"
              >
                {[
                  {
                    href: DISCORD_URL,
                    icon: DiscordIcon,
                    label: "Discord",
                  },
                  {
                    href: "https://github.com/ThinkEx-OSS/filerouter",
                    icon: GitHubIcon,
                    label: "GitHub",
                  },
                ].map(({ href, icon: Icon, label }) => (
                  <a
                    className="group flex items-center gap-3 border-b border-border py-3 text-sm transition-colors hover:text-primary"
                    href={href}
                    key={label}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1">{label}</span>
                    <ArrowUpRight
                      className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      weight="bold"
                    />
                  </a>
                ))}
              </nav>
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
