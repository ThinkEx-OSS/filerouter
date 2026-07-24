import { BenchmarkScatterChart } from "@/components/benchmark-scatter-chart"
import type { BenchmarkEntry, BenchmarkMetric } from "@/lib/benchmark-data"
import { LONG_EXTRACTION_LABEL_SIDE } from "@/lib/benchmark-label-sides"
import {
  buildScatterSeries,
  LATENCY_DOMAIN,
  SCATTER_OTHER_COLOR,
} from "@/lib/benchmark-scatter"

const PAD = { top: 36, right: 120, bottom: 52, left: 120 }

function formatLatency(seconds: number) {
  if (seconds >= 1000) return `${(seconds / 60).toFixed(0)}m`
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60)
    const rest = Math.round(seconds % 60)
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
  }
  return `${Math.round(seconds)}s`
}

export function BenchmarkLatencyScatter({
  entries,
  metric,
  sourceNote,
}: {
  entries: ReadonlyArray<BenchmarkEntry>
  metric: BenchmarkMetric
  sourceNote: string
}) {
  const { points, xDomain, yDomain, note } = buildScatterSeries({
    entries,
    metric,
    getX: (entry) => entry.latencyP50Seconds,
    colorFor: (_name, supported) =>
      supported ? "var(--primary)" : SCATTER_OTHER_COLOR,
    domain: LATENCY_DOMAIN,
    formatX: formatLatency,
    emptyXDomain: [0, 400],
  })

  if (points.length === 0) return null

  return (
    <BenchmarkScatterChart
      footer={[note, sourceNote].filter(Boolean).join(" · ")}
      formatX={formatLatency}
      formatY={(tick) =>
        `${Number.isInteger(tick) ? String(tick) : tick.toFixed(1)}${metric.suffix}`
      }
      header={
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          {metric.label} vs p50 latency · faster →
        </p>
      }
      labelSide={LONG_EXTRACTION_LABEL_SIDE}
      metric={metric}
      pad={PAD}
      points={points}
      reverseX
      tooltipDetail={(point) => `p50 ${formatLatency(point.x)}`}
      xAxisLabel="p50 latency"
      xDomain={xDomain}
      yDomain={yDomain}
    />
  )
}
