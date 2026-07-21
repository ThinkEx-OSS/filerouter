import { createServerFn } from "@tanstack/react-start"

import { readPublicPostHogConfig } from "@/integrations/posthog/config.server"

export const getPublicPostHogConfig = createServerFn({ method: "GET" }).handler(
  () => readPublicPostHogConfig()
)
