import { useEffect } from "react"

import type { PublicPostHogConfig } from "@/integrations/posthog/config"
import { initializePostHog } from "@/integrations/posthog/browser"

export function PostHogBootstrap({
  config,
}: {
  config: PublicPostHogConfig | undefined
}) {
  useEffect(() => {
    if (config) {
      initializePostHog(config)
    }
  }, [config])

  return null
}
