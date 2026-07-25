const PRIVATE_PATH_PREFIXES = ["/api", "/dashboard", "/device", "/sign-in"]

function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function withSecurityHeaders(
  request: Request,
  response: Response
): Response {
  const headers = new Headers(response.headers)
  const url = new URL(request.url)

  headers.set(
    "Content-Security-Policy",
    "base-uri 'none'; frame-ancestors 'none'; object-src 'none'"
  )
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("X-Frame-Options", "DENY")
  headers.set("X-XSS-Protection", "0")

  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=86400")
  }

  if (isPrivatePath(url.pathname)) {
    headers.set("Cache-Control", "private, no-store")
    headers.set("X-Robots-Tag", "noindex, nofollow")
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
