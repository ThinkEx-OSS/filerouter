import { env } from "cloudflare:workers"

import {
  getPostHogConfig,
  type PostHogEnv,
} from "@/integrations/posthog/config"

export function readPublicPostHogConfig() {
  return getPostHogConfig(env as Cloudflare.Env & PostHogEnv)
}
