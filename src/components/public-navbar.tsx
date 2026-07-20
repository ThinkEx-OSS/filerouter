import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { AppNavbar } from "@/components/app-navbar"
import { GitHubIcon } from "@/components/community-links"
import { ModeToggle } from "@/components/mode-toggle"
import { PublicNavLinks } from "@/components/public-nav-links"
import { Button } from "@/components/ui/button"
import { getAuthSessionQueryOptions } from "@/lib/session-query"

export function PublicNavbar() {
  const { data: session } = useQuery(getAuthSessionQueryOptions())

  return (
    <AppNavbar navigation={<PublicNavLinks />}>
      <ModeToggle className="size-9" />
      <Button asChild className="hidden sm:inline-flex" variant="outline">
        <a href="https://github.com/ThinkEx-OSS/filerouter">
          <GitHubIcon className="size-4" />
          GitHub
        </a>
      </Button>
      <Button asChild>
        {session ? (
          <Link to="/dashboard">Dashboard</Link>
        ) : (
          <Link search={{ redirect: "/dashboard" }} to="/sign-in">
            Get started
          </Link>
        )}
      </Button>
    </AppNavbar>
  )
}
