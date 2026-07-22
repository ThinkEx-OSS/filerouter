import { createFileRoute } from "@tanstack/react-router"

import { BlogIndexPage } from "@/components/blog/blog-index-page"
import { buildPublicMeta, getAbsoluteUrl } from "@/lib/seo"

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: buildPublicMeta({
      title: "Blog",
      description:
        "Practical guides, product updates, and engineering notes about document parsing across providers.",
      path: "/blog",
    }),
    links: [{ rel: "canonical", href: getAbsoluteUrl("/blog") }],
  }),
  component: BlogIndexPage,
})
