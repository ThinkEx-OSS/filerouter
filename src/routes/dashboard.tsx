import { BookOpenText, CloudArrowUp, SignOut } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { ApiKeys } from "@/components/api-keys"
import { AppNavbar } from "@/components/app-navbar"
import {
  DISCORD_URL,
  DiscordIcon,
  GitHubIcon,
} from "@/components/community-links"
import { DashboardQuickstart } from "@/components/dashboard-quickstart"
import { DashboardBilling } from "@/components/dashboard-billing"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import {
  captureBrowserException,
  identifyBrowserUser,
  resetBrowserUser,
} from "@/integrations/posthog/browser"
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
  const { session } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    identifyBrowserUser(session.user.id)
  }, [session.user.id])

  async function signOut() {
    setSigningOut(true)
    try {
      const result = await authClient.signOut()
      if (result.error) {
        throw new Error(result.error.message)
      }
      resetBrowserUser()
      queryClient.clear()
      await router.navigate({ to: "/" })
    } catch (error) {
      captureBrowserException(error, { operation: "sign_out" })
      setSigningOut(false)
    }
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <AppNavbar>
        <div className="flex items-center gap-1">
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

      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="grid min-w-0 gap-10">
            <ApiKeys />
            <DashboardQuickstart />
          </div>

          <aside className="min-w-0 bg-muted/35 p-4 lg:sticky lg:top-20">
            <h2 className="text-sm font-medium">Resources</h2>
            <nav aria-label="Resources" className="mt-2 grid gap-1">
              {[
                {
                  href: "https://docs.filerouter.dev",
                  icon: BookOpenText,
                  label: "Documentation",
                },
                {
                  href: "https://docs.filerouter.dev/api/overview",
                  icon: CloudArrowUp,
                  label: "API reference",
                },
                {
                  href: "https://github.com/ThinkEx-OSS/filerouter",
                  icon: GitHubIcon,
                  label: "GitHub",
                },
                {
                  href: DISCORD_URL,
                  icon: DiscordIcon,
                  label: "Discord",
                },
              ].map(({ href, icon: Icon, label }) => (
                <a
                  className="flex items-center gap-3 px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  href={href}
                  key={label}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Icon className="size-4 shrink-0" weight="bold" />
                  {label}
                </a>
              ))}
            </nav>
            <div className="my-5 h-px bg-border" />
            <DashboardBilling />
          </aside>
        </div>
      </div>
    </main>
  )
}
