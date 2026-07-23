import {
  ArrowRight,
  ArrowsSplit,
  BracketsCurly,
  CheckCircle,
  CloudArrowUp,
  Code,
  Cpu,
  FilePdf,
  Key,
} from "@phosphor-icons/react"
import { DitherGradient } from "@/components/dither-kit/gradient"
import { FileRouterLogo } from "@/components/file-router-logo"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { availableProviders } from "@/lib/provider-display"
import { cn } from "@/lib/utils"

const modes = [
  { icon: CloudArrowUp, id: "hosted", label: "Hosted", shortLabel: "Hosted" },
  {
    icon: Key,
    id: "direct",
    label: "Direct (BYOK)",
    shortLabel: "Direct",
  },
  { icon: ArrowsSplit, id: "compare", label: "Compare", shortLabel: "Compare" },
] as const

export function RoutingCanvas() {
  return (
    <Tabs
      className="mt-10 gap-0 overflow-hidden rounded-none border border-border bg-background"
      defaultValue="hosted"
    >
      <div className="border-b border-border">
        <TabsList className="grid w-full grid-cols-3" variant="panel">
          {modes.map(({ icon: Icon, id, label, shortLabel }) => (
            <TabsTrigger
              aria-label={`${label} execution mode`}
              className="h-14 justify-center px-3 not-first:border-l not-first:border-border after:h-px data-[state=inactive]:hover:bg-muted/30 sm:justify-start sm:px-5"
              key={id}
              value={id}
            >
              <Icon className="size-4 text-primary" weight="regular" />
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="hosted">
        <RouteStage
          center={<FileRouterNode detail="Durable job" />}
          footer={[
            "Upload once",
            "Durable jobs",
            "Safe retries",
            "Stored results",
            "Automatic cleanup",
          ]}
          providers={<HostedProvidersNode />}
        />
      </TabsContent>

      <TabsContent value="direct">
        <RouteStage
          center={<RuntimeNode />}
          footer={[
            "Your runtime",
            "Your keys",
            "Provider billing",
            "Same result shape",
          ]}
          providers={<SelectedProvider />}
        />
      </TabsContent>

      <TabsContent value="compare">
        <RouteStage
          center={<FileRouterNode detail="compare()" compare />}
          footer={[
            "One document",
            "Parallel executions",
            "Partial success",
            "Normalized results",
          ]}
          providers={<ProviderStack />}
        />
      </TabsContent>
    </Tabs>
  )
}

function RouteStage({
  center,
  footer,
  providers,
}: {
  center: React.ReactNode
  footer: ReadonlyArray<string>
  providers: React.ReactNode
}) {
  return (
    <div className="relative overflow-hidden bg-background">
      <DitherGradient
        cell={5}
        className="opacity-55"
        direction="left"
        opacity={0.12}
      />

      <div className="relative flex min-h-[25rem] flex-col items-center justify-center px-5 py-10 md:flex-row md:px-8 md:py-14">
        <FileNode />
        <RouteConnector />
        {center}
        <RouteConnector />
        {providers}
        <RouteConnector />
        <ResultNode />
      </div>

      <div className="relative flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border bg-background/90 px-5 py-4">
        {footer.map((item) => (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            key={item}
          >
            <CheckCircle className="size-3.5 text-primary" weight="fill" />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function FileNode() {
  return (
    <RouteNode className="w-full max-w-44">
      <FilePdf className="size-6 text-primary" weight="regular" />
      <p className="mt-5 text-sm font-medium">document.pdf</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">Input</p>
    </RouteNode>
  )
}

function FileRouterNode({
  compare = false,
  detail,
}: {
  compare?: boolean
  detail: string
}) {
  return (
    <RouteNode className="w-full max-w-48 border-primary/35 shadow-[0_0_48px_-28px_var(--primary)]">
      <div className="flex items-center gap-2">
        {compare ? (
          <ArrowsSplit className="size-5 text-primary" weight="bold" />
        ) : (
          <span className="inline-flex size-8 items-center justify-center">
            <FileRouterLogo className="h-5 w-auto" />
          </span>
        )}
      </div>
      <p className="mt-4 text-sm font-medium">FileRouter</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{detail}</p>
    </RouteNode>
  )
}

function RuntimeNode() {
  return (
    <RouteNode className="w-full max-w-48 border-primary/35 shadow-[0_0_48px_-28px_var(--primary)]">
      <Code className="size-6 text-primary" weight="regular" />
      <p className="mt-5 text-sm font-medium">Your runtime</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        @file_router/sdk
      </p>
    </RouteNode>
  )
}

function SelectedProvider() {
  const provider = availableProviders[0]

  return (
    <RouteNode className="w-full max-w-48">
      <ProviderLogo provider={provider} />
      <p className="mt-5 font-mono text-xs text-muted-foreground">
        Selected provider
      </p>
    </RouteNode>
  )
}

function HostedProvidersNode() {
  return (
    <RouteNode className="w-full max-w-52">
      <Cpu className="size-6 text-primary" weight="regular" />
      <p className="mt-4 text-sm font-medium">Providers</p>
      <p className="mt-1 font-mono text-[10px] leading-4 text-muted-foreground">
        LlamaParse · Mistral OCR · Datalab · LiteParse · PDF Inspector
      </p>
    </RouteNode>
  )
}

function ProviderStack() {
  return (
    <div className="grid w-full max-w-48 gap-2">
      {availableProviders.map((provider) => (
        <div
          aria-label={provider.label}
          className="flex h-12 items-center rounded-none border border-border bg-background/90 px-3 shadow-sm"
          key={provider.id}
          role="img"
        >
          <ProviderLogo compact provider={provider} />
        </div>
      ))}
    </div>
  )
}

function ProviderLogo({
  compact = false,
  provider,
}: {
  compact?: boolean
  provider: (typeof availableProviders)[number]
}) {
  const containerClassName = compact
    ? provider.id === "llamaparse"
      ? "h-6 w-24"
      : "h-5 w-16"
    : "h-8 w-28"

  return (
    <span className={cn("flex items-center", containerClassName)}>
      <img
        alt=""
        className="max-h-full max-w-full object-contain object-left dark:hidden"
        src={provider.logo}
      />
      <img
        alt=""
        className="hidden max-h-full max-w-full object-contain object-left dark:block"
        src={provider.darkLogo}
      />
    </span>
  )
}

function ResultNode() {
  return (
    <RouteNode className="w-full max-w-44">
      <BracketsCurly className="size-6 text-primary" weight="regular" />
      <p className="mt-5 text-sm font-medium">ParseResult</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Normalized output
      </p>
    </RouteNode>
  )
}

function RouteNode({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "min-h-36 rounded-none border border-border bg-background/90 p-5 shadow-sm backdrop-blur-sm",
        className
      )}
    >
      {children}
    </div>
  )
}

function RouteConnector() {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-12 shrink-0 items-center justify-center md:h-auto md:w-12 lg:w-16"
    >
      <span className="absolute h-full w-px bg-gradient-to-b from-border via-primary/60 to-border md:h-px md:w-full md:bg-gradient-to-r" />
      <span className="relative inline-flex size-6 rotate-90 items-center justify-center rounded-full border border-primary/30 bg-background text-primary shadow-sm md:rotate-0">
        <ArrowRight className="size-3" weight="bold" />
      </span>
    </div>
  )
}
