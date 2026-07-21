import { Check, Copy } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

const loginCommand = "npx @file_router/cli@latest login"
const parseCommand =
  "npx @file_router/cli@latest parse document.pdf --provider llamaparse"

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

function Step({
  children,
  number,
  title,
}: {
  children: React.ReactNode
  number: string
  title: string
}) {
  return (
    <li className="min-w-0">
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Step {number}
        </p>
        <h3 className="mt-1 text-base font-medium">{title}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </li>
  )
}

export function DashboardQuickstart() {
  return (
    <section
      aria-labelledby="quickstart-title"
      className="min-w-0 scroll-mt-20"
      id="quickstart"
    >
      <div>
        <h1 className="text-xl font-medium" id="quickstart-title">
          Start with the CLI
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your account and parse a document in two commands.
        </p>
      </div>

      <ol className="mt-6 grid gap-7">
        <Step number="01" title="Connect your account">
          <p className="mb-3 text-sm leading-6 text-muted-foreground">
            Approve the browser prompt. The CLI creates and stores its own key.
          </p>
          <div className="relative min-w-0 overflow-hidden border border-border bg-muted/35">
            <code className="block max-w-full overflow-x-auto py-3 pr-12 pl-4 text-sm">
              {loginCommand}
            </code>
            <CopyButton label="Copy login command" value={loginCommand} />
          </div>
        </Step>

        <Step number="02" title="Parse a document">
          <div className="relative min-w-0 overflow-hidden border border-border bg-muted/35">
            <code className="block max-w-full overflow-x-auto py-3 pr-12 pl-4 text-sm">
              {parseCommand}
            </code>
            <CopyButton label="Copy parse command" value={parseCommand} />
          </div>
        </Step>
      </ol>
    </section>
  )
}
