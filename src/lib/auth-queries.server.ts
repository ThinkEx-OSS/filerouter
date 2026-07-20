import { withAuth } from "@/lib/auth.server"

export async function getSessionFromHeaders(headers: Headers) {
  return withAuth((auth) => auth.api.getSession({ headers }))
}
