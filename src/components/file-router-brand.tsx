import { Link } from "@tanstack/react-router"

import { FileRouterLogo } from "@/components/file-router-logo"

export function FileRouterBrand() {
  return (
    <Link aria-label="FileRouter" className="flex items-center gap-3.5" to="/">
      <FileRouterLogo className="h-8 w-auto" />
      <span className="text-2xl font-normal tracking-normal">FileRouter</span>
    </Link>
  )
}
