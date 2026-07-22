import { AgentMarks } from "@/components/agent-marks"
import { ClipboardCopyButton } from "@/components/clipboard-copy-button"

const integrationPrompt =
  "Use https://docs.filerouter.dev to understand FileRouter. Inspect this project's document flow, ask clarifying questions, and propose the cleanest integration plan before changing code."

function QuickstartItem({
  children,
  titleAdornment,
  title,
}: {
  children: React.ReactNode
  titleAdornment?: React.ReactNode
  title: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <h2 className="text-base font-medium">{title}</h2>
        {titleAdornment}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

export function DashboardQuickstart() {
  return (
    <section
      aria-label="SDK quickstart"
      className="min-w-0 scroll-mt-20"
      id="quickstart"
    >
      <div className="grid gap-8">
        <QuickstartItem
          title="Plan with your agent"
          titleAdornment={<AgentMarks />}
        >
          <div className="relative min-w-0 border border-border bg-muted/35">
            <pre className="max-w-full overflow-x-auto py-4 pr-12 pl-4 font-mono text-sm leading-6 whitespace-pre-wrap">
              <code>{integrationPrompt}</code>
            </pre>
            <ClipboardCopyButton
              className="absolute top-2 right-2"
              label="integration prompt"
              size="icon-sm"
              value={integrationPrompt}
              variant="ghost"
            />
          </div>
        </QuickstartItem>
      </div>
    </section>
  )
}
