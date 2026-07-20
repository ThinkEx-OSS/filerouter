export const seo = {
  siteUrl: "https://filerouter.dev",
  siteName: "FileRouter",
  defaultTitle: "FileRouter",
  defaultDescription:
    "Durable document parsing across providers with one TypeScript SDK, CLI, and API.",
} as const

type PublicMetaOptions = {
  title?: string
  description?: string
  openGraphType?: "website" | "article"
}

export function getAbsoluteUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path

  return `${seo.siteUrl}${path.startsWith("/") ? path : `/${path}`}`
}

export function getPageTitle(title?: string) {
  if (!title || title === seo.defaultTitle) return seo.defaultTitle
  return `${title} | ${seo.defaultTitle}`
}

export function buildPublicMeta({
  title,
  description = seo.defaultDescription,
  openGraphType = "website",
}: PublicMetaOptions = {}) {
  const pageTitle = getPageTitle(title)

  return [
    { title: pageTitle },
    { name: "description", content: description },
    { property: "og:title", content: pageTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: openGraphType },
    { property: "og:site_name", content: seo.siteName },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: pageTitle },
    { name: "twitter:description", content: description },
  ]
}
