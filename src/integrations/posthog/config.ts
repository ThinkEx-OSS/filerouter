export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com"

export interface PostHogEnv {
  POSTHOG_HOST?: string
  POSTHOG_PROJECT_TOKEN?: string
}

export interface PublicPostHogConfig {
  host: string
  token: string
}

export function getPostHogConfig(
  env: PostHogEnv
): PublicPostHogConfig | undefined {
  const token = env.POSTHOG_PROJECT_TOKEN?.trim()
  if (!token) {
    return undefined
  }
  return {
    host: env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST,
    token,
  }
}
