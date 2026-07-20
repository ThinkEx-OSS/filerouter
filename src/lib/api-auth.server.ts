import { withAuth } from "@/lib/auth.server"
import { HttpError } from "@/lib/http.server"

export interface ApiPrincipal {
  credentialId: string
  kind: "api-key"
  userId: string
}

export async function requireApiPrincipal(
  request: Request,
  permission: "create" | "read"
): Promise<ApiPrincipal> {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing FileRouter API key.")
  }

  const token = authorization.slice("Bearer ".length).trim()
  if (!token) {
    throw new HttpError(401, "Invalid FileRouter API key.")
  }

  const result = await withAuth((auth) =>
    auth.api.verifyApiKey({
      body: {
        key: token,
        permissions: { jobs: [permission] },
      },
    })
  )

  if (!result.valid || !result.key) {
    throw new HttpError(401, "Invalid FileRouter API key.")
  }

  return {
    credentialId: result.key.id,
    kind: "api-key",
    userId: result.key.referenceId,
  }
}
