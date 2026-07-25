import { describe, expect, it } from "vite-plus/test"

import { withSecurityHeaders } from "@/lib/security-headers"

describe("withSecurityHeaders", () => {
  it("adds the browser security baseline without changing the response", async () => {
    const response = withSecurityHeaders(
      new Request("https://filerouter.dev/"),
      new Response("ok", {
        headers: { "Content-Type": "text/plain" },
        status: 201,
        statusText: "Created",
      })
    )

    expect(response.status).toBe(201)
    expect(response.statusText).toBe("Created")
    expect(response.headers.get("Content-Type")).toBe("text/plain")
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "base-uri 'none'; frame-ancestors 'none'; object-src 'none'"
    )
    expect(response.headers.get("Permissions-Policy")).toBe(
      "camera=(), geolocation=(), microphone=()"
    )
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    )
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=86400"
    )
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("X-Frame-Options")).toBe("DENY")
    expect(response.headers.get("X-XSS-Protection")).toBe("0")
    expect(response.headers.has("Cache-Control")).toBe(false)
    expect(await response.text()).toBe("ok")
  })

  it.each([
    "/api/auth/get-session",
    "/api/v1/jobs",
    "/dashboard",
    "/dashboard/billing",
    "/device",
    "/sign-in",
  ])("prevents storage and indexing for %s", (pathname) => {
    const response = withSecurityHeaders(
      new Request(`https://filerouter.dev${pathname}`),
      new Response(null, { headers: { "Cache-Control": "public" } })
    )

    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow")
  })

  it("does not send HSTS over an insecure connection", () => {
    const response = withSecurityHeaders(
      new Request("http://localhost:3000/"),
      new Response()
    )

    expect(response.headers.has("Strict-Transport-Security")).toBe(false)
  })
})
