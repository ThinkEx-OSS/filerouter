export const seo = {
  siteUrl: "https://filerouter.dev",
  siteName: "FileRouter",
  defaultTitle: "FileRouter",
  defaultDescription:
    "Inspect, parse, and compare documents across providers through one durable API.",
  defaultSocialImage: "/og-image.png",
  defaultSocialImageAlt: "White FileRouter logo on a blue background",
} as const

type PublicMetaOptions = {
  title?: string
  description?: string
  openGraphType?: "website" | "article"
  path?: string
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
  path,
}: PublicMetaOptions = {}) {
  const pageTitle = getPageTitle(title)
  const pageUrl = path ? getAbsoluteUrl(path) : undefined

  return [
    { title: pageTitle },
    { name: "description", content: description },
    { property: "og:title", content: pageTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: openGraphType },
    { property: "og:site_name", content: seo.siteName },
    { property: "og:locale", content: "en_US" },
    ...(pageUrl ? [{ property: "og:url", content: pageUrl }] : []),
    ...buildSocialImageMeta(),
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: pageTitle },
    { name: "twitter:description", content: description },
  ]
}

export function buildSocialImageMeta() {
  const imageUrl = getAbsoluteUrl(seo.defaultSocialImage)

  return [
    { property: "og:image", content: imageUrl },
    { property: "og:image:secure_url", content: imageUrl },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: seo.defaultSocialImageAlt },
    { name: "twitter:image", content: imageUrl },
    { name: "twitter:image:alt", content: seo.defaultSocialImageAlt },
  ]
}
