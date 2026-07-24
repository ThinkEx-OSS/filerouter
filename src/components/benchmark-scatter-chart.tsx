import { useState, type ReactNode } from "react"

import type { BenchmarkMetric } from "@/lib/benchmark-data"
import type { MetricLabelSideConfig } from "@/lib/benchmark-label-placement"
import {
  makeScatterScales,
  placeScatterLabels,
  SCATTER_HEIGHT,
  SCATTER_WIDTH,
  ticksInDomain,
  type ScatterDatum,
  type ScatterPad,
} from "@/lib/benchmark-scatter"

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace" as const

export function BenchmarkScatterChart({
  points,
  metric,
  xDomain,
  yDomain,
  reverseX,
  formatX,
  formatY,
  xAxisLabel,
  header,
  footer,
  labelSide,
  pad,
  tooltipDetail,
}: {
  points: ReadonlyArray<ScatterDatum>
  metric: BenchmarkMetric
  xDomain: readonly [number, number]
  yDomain: readonly [number, number]
  reverseX: boolean
  formatX: (value: number) => string
  formatY?: (value: number) => string
  xAxisLabel: string
  header: ReactNode
  footer: string
  labelSide: MetricLabelSideConfig
  pad: ScatterPad
  tooltipDetail: (point: ScatterDatum) => string
}) {
  const [activeName, setActiveName] = useState<string | null>(null)

  if (points.length === 0) return null

  const scales = makeScatterScales(pad, xDomain, yDomain, reverseX)
  const layout = {
    ...scales,
    xTicks: ticksInDomain(xDomain),
    yTicks: ticksInDomain(yDomain),
    placed: placeScatterLabels(
      points,
      metric.id,
      labelSide,
      scales.x,
      scales.y,
      scales.midX
    ),
  }

  const active = points.find((point) => point.name === activeName) ?? null
  const formatScore =
    formatY ??
    ((value: number) =>
      Number.isInteger(value) ? String(value) : value.toFixed(1))

  return (
    <div className="relative mt-5 border border-border bg-background">
      <div className="border-b border-border px-4 py-3">{header}</div>

      <div className="relative">
        <svg
          aria-label={`${metric.label} versus ${xAxisLabel}`}
          className="h-auto w-full"
          role="img"
          viewBox={`0 0 ${SCATTER_WIDTH} ${SCATTER_HEIGHT}`}
        >
          {layout.xTicks.map((tick) => {
            const px = layout.x(tick)
            return (
              <g key={`x-${tick}`}>
                <line
                  stroke="var(--border)"
                  strokeDasharray="3 4"
                  x1={px}
                  x2={px}
                  y1={pad.top}
                  y2={SCATTER_HEIGHT - pad.bottom}
                />
                <text
                  className="fill-muted-foreground"
                  fontFamily={MONO}
                  fontSize="10"
                  textAnchor="middle"
                  x={px}
                  y={SCATTER_HEIGHT - pad.bottom + 18}
                >
                  {formatX(tick)}
                </text>
              </g>
            )
          })}

          {layout.yTicks.map((tick) => {
            const py = layout.y(tick)
            return (
              <g key={`y-${tick}`}>
                <line
                  stroke="var(--border)"
                  strokeDasharray="3 4"
                  x1={pad.left}
                  x2={SCATTER_WIDTH - pad.right}
                  y1={py}
                  y2={py}
                />
                <text
                  className="fill-muted-foreground"
                  fontFamily={MONO}
                  fontSize="10"
                  textAnchor="end"
                  x={pad.left - 10}
                  y={py + 3}
                >
                  {formatScore(tick)}
                </text>
              </g>
            )
          })}

          <text
            className="fill-muted-foreground"
            fontFamily={MONO}
            fontSize="10"
            textAnchor="middle"
            transform={`rotate(-90 ${18} ${SCATTER_HEIGHT / 2})`}
            x={18}
            y={SCATTER_HEIGHT / 2}
          >
            {metric.label}
          </text>
          <text
            className="fill-muted-foreground"
            fontFamily={MONO}
            fontSize="10"
            textAnchor="middle"
            x={(pad.left + SCATTER_WIDTH - pad.right) / 2}
            y={SCATTER_HEIGHT - 12}
          >
            {xAxisLabel}
          </text>

          {layout.placed.map((item) => (
            <text
              fill={item.point.color}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="11"
              fontWeight={500}
              key={`label-${item.point.name}`}
              pointerEvents="none"
              textAnchor={item.anchor}
              x={item.x}
              y={item.y + 3}
            >
              {item.point.name}
            </text>
          ))}

          {points.map((point) => {
            const cx = layout.x(point.x)
            const cy = layout.y(point.score)
            const isActive = activeName === point.name
            return (
              <g
                className="cursor-default"
                key={point.name}
                onBlur={() => setActiveName(null)}
                onFocus={() => setActiveName(point.name)}
                onMouseEnter={() => setActiveName(point.name)}
                onMouseLeave={() => setActiveName(null)}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  fill="transparent"
                  r="14"
                  tabIndex={0}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  fill={point.color}
                  r={isActive ? 5.5 : point.supported ? 4.5 : 3.25}
                  stroke="var(--background)"
                  strokeWidth={1.25}
                />
              </g>
            )
          })}
        </svg>

        {active ? (
          <div className="pointer-events-none absolute top-3 right-3 z-10 max-w-[16rem] border border-border bg-background/95 px-3 py-2 text-left shadow-sm backdrop-blur-sm">
            <p className="text-sm font-medium text-balance">{active.name}</p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {metric.label} {active.score.toFixed(metric.decimals)}
              {metric.suffix} · {tooltipDetail(active)}
            </p>
          </div>
        ) : null}
      </div>

      <p className="border-t border-border px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        {footer}
      </p>
    </div>
  )
}
