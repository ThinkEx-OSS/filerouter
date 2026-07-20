import { Link } from "@tanstack/react-router"

import { FileRouterLogo } from "@/components/file-router-logo"

export function FileRouterBrand() {
  return (
    <Link
      aria-label="FileRouter home"
      className="flex items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      to="/"
    >
      <FileRouterLogo className="h-7 w-auto" />
      <span className="text-xl font-normal tracking-tight sm:text-2xl">
        FileRouter
      </span>
    </Link>
  )
}
