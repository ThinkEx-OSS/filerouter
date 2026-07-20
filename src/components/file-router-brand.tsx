import { Link, useRouterState } from "@tanstack/react-router"
import type { MouseEvent } from "react"

import { FileRouterLogo } from "@/components/file-router-logo"

export function FileRouterBrand() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  function handleHomeClick(event: MouseEvent<HTMLAnchorElement>) {
    const isPlainLeftClick =
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey

    if (
      !isPlainLeftClick ||
      pathname !== "/" ||
      window.location.search ||
      window.location.hash
    ) {
      return
    }

    event.preventDefault()
    window.scrollTo({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      left: 0,
      top: 0,
    })
  }

  return (
    <Link
      aria-label="FileRouter home"
      className="flex items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={handleHomeClick}
      to="/"
    >
      <FileRouterLogo className="h-7 w-auto" />
      <span className="text-xl font-normal tracking-tight sm:text-2xl">
        FileRouter
      </span>
    </Link>
  )
}
