import { FileText, GoogleLogo, SpinnerGap } from "@phosphor-icons/react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState } from "react"

import { FileRouterBrand } from "@/components/file-router-brand"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { getAuthSessionQueryOptions } from "@/lib/session-query"

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : "/dashboard",
  }),
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(
      getAuthSessionQueryOptions()
    )

    if (session) {
      throw redirect({ to: search.redirect })
    }
  },
  component: SignInPage,
})

function SignInPage() {
  const { redirect: callbackURL } = Route.useSearch()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function continueWithGoogle() {
    setLoading(true)
    setError(null)

    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL,
    })

    if (result.error) {
      setLoading(false)
      setError(result.error.message ?? "Google sign in is not configured yet.")
    }
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <FileRouterBrand />
        <ModeToggle className="size-9" />
      </header>

      <section className="mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(380px,0.65fr)]">
        <div className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
            <FileText className="size-4 text-primary" weight="bold" />
            Developer access for FileRouter.
          </div>
          <h1 className="text-4xl font-medium tracking-normal text-balance md:text-6xl">
            Compare document providers from one account.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
            Create API keys for the CLI, TypeScript SDK, and HTTP API.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-medium">Continue to FileRouter</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with Google to manage developer access.
            </p>
          </div>

          <div className="grid gap-3">
            <Button
              className="h-11 w-full justify-start gap-3 px-4"
              variant="outline"
              onClick={continueWithGoogle}
              disabled={loading}
            >
              {loading ? (
                <SpinnerGap className="size-4 animate-spin" weight="bold" />
              ) : (
                <GoogleLogo className="size-4" weight="bold" />
              )}
              Continue with Google
            </Button>
          </div>

          {error ? (
            <p className="mt-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  )
}
