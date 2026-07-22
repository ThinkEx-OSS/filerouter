import geistLatinWoff2 from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url"
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"

import { ThemeProvider } from "@/components/theme-provider"
import { NotFoundPage } from "@/components/not-found-page"
import { PostHogBootstrap } from "@/components/posthog-bootstrap"
import { RootError } from "@/components/root-error"
import { getPublicPostHogConfig } from "@/integrations/posthog/config.functions"
import type { AuthSession } from "@/lib/session-query"

import appCss from "../styles.css?url"

interface RouterContext {
  queryClient: QueryClient
  session?: AuthSession | null
}

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: () => getPublicPostHogConfig(),
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "FileRouter",
      },
      {
        name: "description",
        content:
          "Inspect, parse, and compare documents across providers through one durable API.",
      },
      {
        name: "application-name",
        content: "FileRouter",
      },
      {
        name: "apple-mobile-web-app-title",
        content: "FileRouter",
      },
      {
        name: "theme-color",
        content: "#00bdf7",
      },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1",
      },
    ],
    links: [
      {
        rel: "preload",
        href: geistLatinWoff2,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "icon",
        href: "/favicon.svg",
        type: "image/svg+xml",
      },
      {
        rel: "icon",
        href: "/favicon.ico",
        sizes: "16x16 32x32 48x48",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
        sizes: "180x180",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      {
        rel: "sitemap",
        href: "/sitemap.xml",
        type: "application/xml",
      },
      {
        rel: "alternate",
        href: "/llms.txt",
        type: "text/plain",
        title: "FileRouter for AI agents",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  errorComponent: RootError,
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  const postHogConfig = Route.useLoaderData()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider defaultTheme="system" storageKey="theme">
          <PostHogBootstrap config={postHogConfig} />
          {children}
          {import.meta.env.DEV ? (
            <TanStackDevtools
              config={{
                position: "bottom-right",
              }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
          ) : null}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
