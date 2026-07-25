export const DEFAULT_POSTHOG_HOST = "https://h.filerouter.dev"

export interface PostHogEnv {
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
    host: DEFAULT_POSTHOG_HOST,
    token,
  }
}
