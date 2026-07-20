import { Link } from "@tanstack/react-router"

import { AppNavbar } from "@/components/app-navbar"
import { GitHubIcon } from "@/components/community-links"
import { DitherButton } from "@/components/dither-kit/button"
import { ModeToggle } from "@/components/mode-toggle"
import { PublicNavLinks } from "@/components/public-nav-links"
import { Button } from "@/components/ui/button"

export function PublicNavbar() {
  return (
    <AppNavbar navigation={<PublicNavLinks />}>
      <ModeToggle className="size-9" />
      <Button
        asChild
        className="hidden h-9 px-3 text-sm sm:inline-flex"
        variant="outline"
      >
        <a href="https://github.com/ThinkEx-OSS/filerouter">
          <GitHubIcon className="size-4" />
          GitHub
        </a>
      </Button>
      <DitherButton
        asChild
        bloom="aura"
        className="h-9 px-3 text-sm"
        color="blue"
      >
        <Link to="/dashboard">Dashboard</Link>
      </DitherButton>
    </AppNavbar>
  )
}
