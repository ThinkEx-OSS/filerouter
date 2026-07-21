import { Link } from "@tanstack/react-router"

import { FileRouterBrand } from "@/components/file-router-brand"
import { Button } from "@/components/ui/button"

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-5 py-6">
      <FileRouterBrand />
      <section className="flex flex-1 flex-col items-start justify-center py-16">
        <p className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase">
          404
        </p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">
          Page not found
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          The page may have moved, or the address may be incorrect.
        </p>
        <Button asChild className="mt-7">
          <Link to="/">Back to FileRouter</Link>
        </Button>
      </section>
    </main>
  )
}
