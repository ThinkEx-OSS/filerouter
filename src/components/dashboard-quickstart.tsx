import {
  ArrowUpRight,
  Check,
  Copy,
  Play,
  TerminalWindow,
} from "@phosphor-icons/react"

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
  icon,
  number,
  title,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  number: string
  title: string
}) {
  return (
    <li className="grid gap-4 border-t border-border py-6 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
      <div className="flex size-10 items-center justify-center bg-muted/50 text-primary">
        {icon}
      </div>
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
      className="scroll-mt-20"
      id="quickstart"
    >
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-medium" id="quickstart-title">
            Start with the CLI
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your account and parse a document in two commands.
          </p>
        </div>
        <Button asChild className="self-start" variant="outline">
          <a href="https://docs.filerouter.dev/quickstart">
            Full quickstart
            <ArrowUpRight weight="bold" />
          </a>
        </Button>
      </div>

      <ol className="pt-6">
        <Step
          icon={<TerminalWindow className="size-5" weight="bold" />}
          number="01"
          title="Connect your account"
        >
          <p className="mb-3 text-sm leading-6 text-muted-foreground">
            Approve the browser prompt. The CLI creates and stores its own key.
          </p>
          <div className="relative overflow-hidden border border-border bg-muted/35">
            <code className="block overflow-x-auto py-3 pr-12 pl-4 text-sm">
              {loginCommand}
            </code>
            <CopyButton label="Copy login command" value={loginCommand} />
          </div>
        </Step>

        <Step
          icon={<Play className="size-5" weight="fill" />}
          number="02"
          title="Parse a document"
        >
          <div className="relative overflow-hidden border border-border bg-muted/35">
            <code className="block overflow-x-auto py-3 pr-12 pl-4 text-sm">
              {parseCommand}
            </code>
            <CopyButton label="Copy parse command" value={parseCommand} />
          </div>
        </Step>
      </ol>

      <p className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">
        Building an integration?{" "}
        <a
          className="text-foreground underline underline-offset-4 hover:text-primary"
          href="https://docs.filerouter.dev/sdk/parse"
        >
          Use the TypeScript SDK
        </a>
        .
      </p>
    </section>
  )
}
