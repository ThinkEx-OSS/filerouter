const linkClassName =
  "text-sm font-normal text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"

export function PublicNavLinks() {
  return (
    <div className="flex items-center gap-6">
      <a className={linkClassName} href="https://docs.filerouter.dev">
        Docs
      </a>
      <a className={linkClassName} href="/#benchmarks">
        Benchmarks
      </a>
      <a className={linkClassName} href="/#pricing">
        Pricing
      </a>
      <Link className={linkClassName} to="/blog">
        Blog
      </Link>
    </div>
  )
}
import { Link } from "@tanstack/react-router"
