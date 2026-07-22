import { Autumn } from "autumn-js"

interface AutumnRuntimeEnv {
  AUTUMN_SECRET_KEY?: string
  HOSTED_BILLING_ENABLED?: string
}

export function createAutumnClient(env: AutumnRuntimeEnv): Autumn | undefined {
  if (env.HOSTED_BILLING_ENABLED !== "true") {
    return undefined
  }

  const secretKey = env.AUTUMN_SECRET_KEY?.trim()
  if (!secretKey) {
    throw new Error(
      "HOSTED_BILLING_ENABLED is true but AUTUMN_SECRET_KEY is not configured."
    )
  }

  return new Autumn({ failOpen: false, secretKey, timeoutMs: 10_000 })
}
