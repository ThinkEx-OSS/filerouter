import { BenchmarkScatterChart } from "@/components/benchmark-scatter-chart"
import type { BenchmarkEntry, BenchmarkMetric } from "@/lib/benchmark-data"
import { PARSEBENCH_LABEL_SIDE } from "@/lib/benchmark-label-sides"
import {
  buildScatterSeries,
  COST_DOMAIN,
  familyScatterColor,
  SCATTER_OTHER_COLOR,
} from "@/lib/benchmark-scatter"

const PAD = { top: 36, right: 150, bottom: 52, left: 150 }

function formatCost(cents: number) {
  if (cents <= 0) return "0¢"
  if (cents < 1) return `${cents.toFixed(2)}¢`
  if (cents < 10) return `${cents.toFixed(2).replace(/\.?0+$/, "")}¢`
  return `${cents.toFixed(cents % 1 === 0 ? 0 : 1)}¢`
}

export function BenchmarkCostScatter({
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
    getX: (entry) => entry.costPerPageCents,
    colorFor: (name, supported) =>
      supported
        ? (familyScatterColor(name) ?? "var(--primary)")
        : SCATTER_OTHER_COLOR,
    domain: COST_DOMAIN,
    formatX: formatCost,
    emptyXDomain: [0, 2],
  })

  if (points.length === 0) return null

  return (
    <BenchmarkScatterChart
      footer={[note, sourceNote].filter(Boolean).join(" · ")}
      formatX={formatCost}
      header={
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          {metric.label} vs ¢ / page · cheaper →
        </p>
      }
      labelSide={PARSEBENCH_LABEL_SIDE}
      metric={metric}
      pad={PAD}
      points={points}
      reverseX
      tooltipDetail={(point) => `${formatCost(point.x)} / page`}
      xAxisLabel="Average cost per page"
      xDomain={xDomain}
      yDomain={yDomain}
    />
  )
}
