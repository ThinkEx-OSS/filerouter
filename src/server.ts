import handler from "@tanstack/react-start/server-entry"

import { api } from "@/api/app"
import { runDocumentRetentionCleanup } from "@/lib/document-retention.server"
import { isHonoApiPath } from "@/lib/request-routing"

export { DocumentWorkflow } from "@/workflows/document-workflow"

export default {
  fetch(request, env, context) {
    const pathname = new URL(request.url).pathname
    if (isHonoApiPath(pathname)) {
      return api.fetch(request, env, context)
    }
    return handler.fetch(request)
  },
  scheduled(_controller, env, context) {
    context.waitUntil(runDocumentRetentionCleanup(env))
  },
} satisfies ExportedHandler<Env>
