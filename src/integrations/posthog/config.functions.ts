import { env as workerEnv } from "cloudflare:workers"
import { createServerFn } from "@tanstack/react-start"

import { getPostHogConfig } from "@/integrations/posthog/config"

export const getPublicPostHogConfig = createServerFn({ method: "GET" }).handler(
  () => getPostHogConfig(workerEnv)
)
