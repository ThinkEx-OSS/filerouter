import type { ReactNode } from "react"

import { PublicPageShell } from "@/components/public-page-shell"

export function BlogShell({ children }: { children: ReactNode }) {
  return <PublicPageShell>{children}</PublicPageShell>
}
