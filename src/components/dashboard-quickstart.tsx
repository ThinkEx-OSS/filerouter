import { Check, Copy } from "@phosphor-icons/react"

import { AgentMarks } from "@/components/agent-marks"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

const integrationPrompt =
  "Use https://docs.filerouter.dev to understand FileRouter. Inspect this project's document flow, ask clarifying questions, and propose the cleanest integration plan before changing code."

function CopyButton({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <Button
      aria-label={copied ? `${label} copied` : label}
      className="absolute top-2 right-2"
      onClick={() => copy(value)}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {copied ? <Check weight="bold" /> : <Copy weight="bold" />}
    </Button>
  )
}

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
            <CopyButton
              label="Copy integration prompt"
              value={integrationPrompt}
            />
          </div>
        </QuickstartItem>
      </div>
    </section>
  )
}
