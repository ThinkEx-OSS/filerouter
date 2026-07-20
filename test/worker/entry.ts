import { api } from "@/api/app"
import { runDocumentRetentionCleanup } from "@/lib/document-retention.server"

export { DocumentWorkflow } from "@/workflows/document-workflow"

export default {
  fetch(request, env, context) {
    return api.fetch(request, env, context)
  },
  scheduled(_controller, env, context) {
    context.waitUntil(runDocumentRetentionCleanup(env))
  },
} satisfies ExportedHandler<Cloudflare.Env>
