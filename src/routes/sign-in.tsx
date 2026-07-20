import { SpinnerGap } from "@phosphor-icons/react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { useState } from "react"

import { AuthLegalNotice } from "@/components/auth-legal-notice"
import { FileRouterLogo } from "@/components/file-router-logo"
import { GoogleIcon } from "@/components/google-icon"
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
  head: () => ({
    meta: [
      { title: "Continue | FileRouter" },
      {
        name: "description",
        content:
          "Continue to FileRouter with Google. No account? We'll create one.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SignInPage,
})

function SignInPage() {
  const { redirect: callbackURL } = Route.useSearch()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function continueWithGoogle() {
    setLoading(true)
    setError(null)

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
      })

      if (result.error) {
        setError(result.error.message ?? "Unable to continue with Google.")
        setLoading(false)
      }
    } catch {
      setError("Unable to continue with Google. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-svh bg-background text-foreground">
      <main className="flex min-h-svh items-center justify-center px-6 py-12 pb-24 sm:px-10 sm:pb-28">
        <div className="flex w-full max-w-md flex-col items-center gap-8 px-8 text-center sm:px-12">
          <Link
            aria-label="FileRouter home"
            className="rounded-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
            to="/"
          >
            <FileRouterLogo className="h-9 w-auto" />
          </Link>

          <h1 className="text-2xl font-medium tracking-tight">
            Continue to FileRouter
          </h1>

          <div className="mx-auto grid w-full max-w-xs gap-3">
            <Button
              className="w-full"
              disabled={loading}
              onClick={continueWithGoogle}
            >
              {loading ? (
                <SpinnerGap className="size-4 animate-spin" />
              ) : (
                <GoogleIcon className="size-4" />
              )}
              Continue with Google
            </Button>

            {error ? (
              <p className="text-center text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <p className="text-center text-xs leading-5 text-muted-foreground">
              No account? We&apos;ll create one.
            </p>
          </div>
        </div>
      </main>

      <div className="absolute inset-x-6 bottom-6 mx-auto max-w-sm sm:bottom-8">
        <AuthLegalNotice />
      </div>
    </div>
  )
}
