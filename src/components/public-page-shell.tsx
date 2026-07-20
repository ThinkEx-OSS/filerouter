import type { ReactNode } from "react"

import { PublicNavbar } from "@/components/public-navbar"
import { SiteFooter } from "@/components/site-footer"

export function PublicPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
