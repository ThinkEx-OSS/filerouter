import type { ReactNode } from "react"

import { FileRouterBrand } from "@/components/file-router-brand"

export function AppNavbar({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background">
      <nav className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-6">
        <FileRouterBrand />
        <div className="flex items-center gap-2 sm:gap-3 [&_[data-slot=button]]:font-normal">
          {children}
        </div>
      </nav>
    </header>
  )
}
