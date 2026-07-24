import {
  ArrowRight,
  BracketsCurly,
  CheckCircle,
  CloudArrowUp,
  Code,
  FilePdf,
  Key,
} from "@phosphor-icons/react"
import { useState } from "react"

import { DitherGradient } from "@/components/dither-kit/gradient"
import { FileRouterLogo } from "@/components/file-router-logo"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ENGINE_LOGO_CLASS,
  hostedEngineRows,
  hostedEnginesStackMinHeight,
  type HostedEngineRow,
} from "@/lib/hosted-engines"
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
] as const

type ModeId = (typeof modes)[number]["id"]

const MODE_IDS: ReadonlySet<string> = new Set(modes.map((mode) => mode.id))

function isModeId(value: string): value is ModeId {
  return MODE_IDS.has(value)
}

/** Shared card width so Hosted ↔ Direct don’t reflow the pipeline. */
const NODE = "w-full max-w-48"
const CENTER_SLOT_MIN_H = "min-h-44"

const stageMeta: Record<
  ModeId,
  {
    footer: ReadonlyArray<string>
  }
> = {
  hosted: {
    footer: [
      "Durable jobs",
      "Safe retries",
      "Stored results",
      "Automatic cleanup",
    ],
  },
  direct: {
    footer: [
      "Your runtime",
      "Your keys",
      "Provider billing",
      "Same result shape",
    ],
  },
}

export function RoutingCanvas() {
  const [mode, setMode] = useState<ModeId>("hosted")
  const footer = stageMeta[mode].footer

  return (
    <Tabs
      className="mt-10 gap-0 overflow-hidden rounded-none border border-border bg-background"
      onValueChange={(value) => {
        if (isModeId(value)) setMode(value)
      }}
      value={mode}
    >
      <div className="border-b border-border">
        <TabsList className="grid w-full grid-cols-2" variant="panel">
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

      {/* One shell — providers slot height derived from hostedEngineRows. */}
      <div className="relative overflow-hidden bg-background">
        <DitherGradient
          cell={5}
          className="opacity-55"
          direction="left"
          opacity={0.12}
        />

        <div className="relative flex flex-col items-center justify-center px-5 py-10 md:flex-row md:px-8 md:py-14">
          <FileNode />
          <RouteConnector />
          <StageSlot className={CENTER_SLOT_MIN_H}>
            {mode === "hosted" ? (
              <FileRouterNode
                actions={["parse()", "compare()"]}
                detail="Durable job"
              />
            ) : (
              <RuntimeNode />
            )}
          </StageSlot>
          <RouteConnector />
          <StageSlot style={{ minHeight: hostedEnginesStackMinHeight }}>
            {mode === "hosted" ? <EngineStack /> : <SelectedProvider />}
          </StageSlot>
          <RouteConnector />
          <ResultNode />
        </div>

        <div className="relative flex min-h-14 flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border bg-background/90 px-5 py-4">
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
    </Tabs>
  )
}

function StageSlot({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn(
        "flex w-full max-w-48 shrink-0 items-center justify-center",
        className
      )}
      style={style}
    >
      {children}
    </div>
  )
}

function FileNode() {
  return (
    <RouteNode className={NODE}>
      <FilePdf className="size-6 text-primary" weight="regular" />
      <p className="mt-5 text-sm font-medium">document</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">Source</p>
    </RouteNode>
  )
}

function FileRouterNode({
  actions,
  detail,
}: {
  actions?: ReadonlyArray<string>
  detail: string
}) {
  return (
    <RouteNode
      className={cn(
        NODE,
        "border-primary/35 shadow-[0_0_48px_-28px_var(--primary)]"
      )}
    >
      <span className="inline-flex size-8 items-center justify-center">
        <FileRouterLogo className="h-5 w-auto" />
      </span>
      <p className="mt-4 text-sm font-medium">FileRouter</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{detail}</p>
      {actions ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {actions.map((action) => (
            <span
              className="border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              key={action}
            >
              {action}
            </span>
          ))}
        </div>
      ) : null}
    </RouteNode>
  )
}

function RuntimeNode() {
  return (
    <RouteNode
      className={cn(
        NODE,
        "border-primary/35 shadow-[0_0_48px_-28px_var(--primary)]"
      )}
    >
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
    <RouteNode className={NODE}>
      <ProviderLogo
        className="h-8 w-28"
        darkLogo={provider.darkLogo}
        logo={provider.logo}
      />
      <p className="mt-5 font-mono text-xs text-muted-foreground">
        Selected provider
      </p>
    </RouteNode>
  )
}

function EngineStack() {
  return (
    <div className={cn("grid gap-2", NODE)}>
      {hostedEngineRows.map((engine) => (
        <EngineRow key={engine.id} row={engine} />
      ))}
    </div>
  )
}

function EngineRow({ row }: { row: HostedEngineRow }) {
  return (
    <div
      aria-label={row.label}
      className="flex h-11 items-center gap-2 rounded-none border border-border bg-background/90 px-3 shadow-sm"
      role="img"
    >
      {row.kind === "branded" ? (
        <>
          <ProviderLogo
            className={ENGINE_LOGO_CLASS[row.logoSize]}
            darkLogo={row.darkLogo}
            logo={row.logo}
          />
          {row.caption ? (
            <span className="truncate font-mono text-[11px] text-foreground">
              {row.caption}
            </span>
          ) : null}
        </>
      ) : (
        <span
          className={cn(
            "font-mono text-[11px]",
            row.muted ? "text-muted-foreground/80" : "text-foreground"
          )}
        >
          {row.label}
        </span>
      )}
    </div>
  )
}

function ProviderLogo({
  className,
  darkLogo,
  logo,
}: {
  className: string
  darkLogo: string
  logo: string
}) {
  return (
    <span className={cn("flex shrink-0 items-center", className)}>
      <img
        alt=""
        className="max-h-full max-w-full object-contain object-left dark:hidden"
        src={logo}
      />
      <img
        alt=""
        className="hidden max-h-full max-w-full object-contain object-left dark:block"
        src={darkLogo}
      />
    </span>
  )
}

function ResultNode() {
  return (
    <RouteNode className={NODE}>
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
