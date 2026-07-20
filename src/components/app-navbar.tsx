import type { ReactNode } from "react"

import { FileRouterBrand } from "@/components/file-router-brand"

export function AppNavbar({
  children,
  navigation,
}: {
  children: ReactNode
  navigation?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur dark:bg-black/95">
      <nav className="relative mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-6">
        <FileRouterBrand />
        {navigation ? (
          <div className="pointer-events-none absolute inset-x-48 hidden justify-center lg:flex">
            <div className="pointer-events-auto">{navigation}</div>
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-2 sm:gap-3 [&_[data-slot=button]]:font-normal">
          {children}
        </div>
      </nav>
    </header>
  )
}
