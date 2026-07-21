import {
  CheckCircle,
  Desktop,
  SpinnerGap,
  XCircle,
} from "@phosphor-icons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { FileRouterBrand } from "@/components/file-router-brand"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import {
  captureBrowserEvent,
  captureBrowserException,
  identifyBrowserUser,
} from "@/integrations/posthog/browser"
import { authClient } from "@/lib/auth-client"
import { getAuthSessionQueryOptions } from "@/lib/session-query"

export const Route = createFileRoute("/device")({
  validateSearch: (search: Record<string, unknown>) => ({
    code:
      typeof search.user_code === "string"
        ? search.user_code
        : typeof search.code === "string"
          ? search.code
          : "",
  }),
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
      { title: "Connect FileRouter CLI" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DeviceAuthorizationPage,
})

function DeviceAuthorizationPage() {
  const { session } = Route.useRouteContext()
  const { code } = Route.useSearch()
  const [outcome, setOutcome] = useState<"approved" | "denied" | null>(null)

  useEffect(() => {
    identifyBrowserUser(session.user.id)
  }, [session.user.id])

  const verification = useQuery({
    enabled: Boolean(code),
    queryKey: ["auth", "device", code],
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/auth/device?user_code=${encodeURIComponent(code)}`,
        { signal }
      )
      const result: unknown = await response.json()
      if (!response.ok) throw new Error(readError(result))
      return true
    },
    retry: false,
  })

  const authorization = useMutation({
    mutationFn: async (action: "approve" | "deny") => {
      const result = await authClient.device[action]({ userCode: code })
      if (result.error) {
        throw new Error(result.error.error_description)
      }
      return action === "approve" ? "approved" : "denied"
    },
    onSuccess: (result) => {
      captureBrowserEvent("cli_authorization_completed", { outcome: result })
      setOutcome(result)
    },
    onError: (error) =>
      captureBrowserException(error, { operation: "cli_authorization" }),
  })

  const error = code
    ? (verification.error ?? authorization.error)
    : new Error("A device code is required.")
  const canRespond = Boolean(code && verification.isSuccess)

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
        <FileRouterBrand />
        <ModeToggle className="size-9" />
      </header>

      <section className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-md items-center px-5 py-12">
        <div className="w-full border-y border-border py-8">
          {outcome ? (
            <div className="text-center">
              {outcome === "approved" ? (
                <CheckCircle
                  className="mx-auto size-9 text-primary"
                  weight="fill"
                />
              ) : (
                <XCircle
                  className="mx-auto size-9 text-muted-foreground"
                  weight="fill"
                />
              )}
              <h1 className="mt-4 text-2xl font-medium">
                {outcome === "approved" ? "CLI connected" : "Request denied"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {outcome === "approved"
                  ? "Return to your terminal. You can close this page."
                  : "The terminal was not authorized. You can close this page."}
              </p>
            </div>
          ) : (
            <>
              <Desktop className="size-8 text-primary" weight="duotone" />
              <h1 className="mt-4 text-2xl font-medium">
                Connect FileRouter CLI
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Approve the terminal displaying this code:
              </p>
              <div className="ph-no-capture my-6 border border-border bg-muted/50 px-4 py-3 text-center font-mono text-xl tracking-widest">
                {code || "Missing code"}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  className="h-11"
                  disabled={!canRespond || authorization.isPending}
                  onClick={() => authorization.mutate("approve")}
                >
                  {authorization.isPending || verification.isPending ? (
                    <SpinnerGap className="size-4 animate-spin" weight="bold" />
                  ) : null}
                  Approve
                </Button>
                <Button
                  className="h-11"
                  disabled={!canRespond || authorization.isPending}
                  onClick={() => authorization.mutate("deny")}
                  variant="outline"
                >
                  Deny
                </Button>
              </div>
              {error ? (
                <p className="mt-4 text-sm text-destructive">{error.message}</p>
              ) : null}
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function readError(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error_description" in value &&
    typeof value.error_description === "string"
  ) {
    return value.error_description
  }
  return "Could not approve this CLI session."
}
