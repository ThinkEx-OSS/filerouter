import { Link } from "@tanstack/react-router"

import {
  CONTACT_EMAIL,
  DISCORD_URL,
  communityLinks,
} from "@/components/community-links"
import { FileRouterLogo } from "@/components/file-router-logo"

const footerLinkClassName =
  "text-base font-normal text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "TypeScript SDK", href: "/#sdk" },
      { label: "Dashboard", to: "/dashboard" },
    ],
  },
  {
    title: "Resources",
    links: [
      {
        label: "Documentation",
        href: "https://github.com/ThinkEx-OSS/filerouter#readme",
      },
      {
        label: "GitHub",
        href: "https://github.com/ThinkEx-OSS/filerouter",
      },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "ThinkEx", href: "https://thinkex.app" },
      { label: "Email", href: `mailto:${CONTACT_EMAIL}` },
      { label: "Community", href: DISCORD_URL },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", to: "/terms" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Cookie Policy", to: "/cookies" },
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-6 py-14 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(12rem,1.1fr)_minmax(0,3fr)] lg:gap-16">
          <div>
            <Link
              aria-label="FileRouter home"
              className="inline-flex rounded-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              to="/"
            >
              <FileRouterLogo className="h-8 w-auto" />
            </Link>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:gap-x-12"
          >
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h2 className="text-sm font-medium text-muted-foreground">
                  {column.title}
                </h2>
                <ul className="mt-4 grid gap-3.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {"to" in link ? (
                        <Link className={footerLinkClassName} to={link.to}>
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          className={footerLinkClassName}
                          href={link.href}
                          rel={
                            link.href.startsWith("http")
                              ? "noopener noreferrer"
                              : undefined
                          }
                          target={
                            link.href.startsWith("http") ? "_blank" : undefined
                          }
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 ThinkEx Inc. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4">
            {communityLinks.map(({ href, icon: Icon, label }) => (
              <a
                aria-label={label}
                className="inline-flex size-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                href={href}
                key={href}
                rel="noopener noreferrer"
                target="_blank"
              >
                <Icon
                  className={label === "Twitter / X" ? "size-4" : "size-5"}
                />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
