import { SignOut } from "@phosphor-icons/react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useState } from "react"

import { ApiKeys } from "@/components/api-keys"
import { FileRouterBrand } from "@/components/file-router-brand"
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
      <header className="border-b border-border">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <FileRouterBrand />

          <div className="flex items-center gap-2">
            <ModeToggle className="size-9" />
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              disabled={signingOut}
            >
              <SignOut weight="bold" />
              Sign out
            </Button>
          </div>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-4xl px-5 py-10">
        <p className="text-sm text-muted-foreground">{session.user.email}</p>
        <h1 className="mt-2 text-3xl font-medium tracking-normal">
          Developer access
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Create an API key for the FileRouter CLI, SDK, or HTTP API.
        </p>

        <ApiKeys />

        <section className="mt-10 border-t border-border pt-8">
          <h2 className="text-lg font-medium">Use your key</h2>
          <div className="mt-4 grid gap-3">
            {[
              ["CLI", "npx @file_router/cli login"],
              ["Environment", "export FILEROUTER_API_KEY=fr_..."],
            ].map(([label, command]) => (
              <div
                className="grid gap-1 md:grid-cols-[8rem_minmax(0,1fr)] md:items-center"
                key={label}
              >
                <span className="text-sm text-muted-foreground">{label}</span>
                <code className="overflow-x-auto rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                  {command}
                </code>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
