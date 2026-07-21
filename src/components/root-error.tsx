import { Link } from "@tanstack/react-router"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { useEffect } from "react"

import { FileRouterBrand } from "@/components/file-router-brand"
import { Button } from "@/components/ui/button"
import { captureBrowserException } from "@/integrations/posthog/browser"

export function RootError({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    captureBrowserException(error, {
      path:
        typeof window === "undefined" ? undefined : window.location.pathname,
    })
  }, [error])

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-5 py-6">
      <FileRouterBrand />
      <section className="flex flex-1 flex-col items-start justify-center py-16">
        <p className="font-mono text-xs tracking-[0.16em] text-destructive uppercase">
          Something went wrong
        </p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">
          FileRouter hit an unexpected error
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          Try the request again. If it keeps failing, contact the team with the
          time it happened.
        </p>
        <div className="mt-7 flex gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
