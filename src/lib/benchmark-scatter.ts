import type { BenchmarkEntry, BenchmarkMetric } from "@/lib/benchmark-data"
import {
  labelSideForMetric,
  placeLabel,
  type LabelAnchor,
  type MetricLabelSideConfig,
} from "@/lib/benchmark-label-placement"
import { resolveSupportedBenchmarkProvider } from "@/lib/provider-display"

export const SCATTER_WIDTH = 720
export const SCATTER_HEIGHT = 420
export const SCATTER_OTHER_COLOR =
  "color-mix(in oklch, var(--foreground) 22%, transparent)"

export type ScatterPad = {
  top: number
  right: number
  bottom: number
  left: number
}

export type ScatterDatum = {
  name: string
  score: number
  x: number
  color: string
  supported: boolean
  showLabel: boolean
}

export type PlacedScatterLabel = {
  point: ScatterDatum
  cx: number
  cy: number
  x: number
  y: number
  anchor: LabelAnchor
}

export function niceTicks(min: number, max: number, count: number) {
  if (!(max > min)) return [min]
  const span = max - min
  const step = span / Math.max(1, count - 1)
  const magnitude = 10 ** Math.floor(Math.log10(step || 1))
  const niceStep =
    [1, 2, 2.5, 5, 10].map((n) => n * magnitude).find((n) => n >= step) ?? step
  const niceMin = Math.floor(min / niceStep) * niceStep
  const niceMax = Math.ceil(max / niceStep) * niceStep
  const ticks: number[] = []
  for (
    let value = niceMin;
    value <= niceMax + niceStep / 2;
    value += niceStep
  ) {
    ticks.push(Number(value.toFixed(6)))
  }
  return ticks
}

export function ticksInDomain(domain: readonly [number, number], count = 5) {
  return niceTicks(domain[0], domain[1], count).filter(
    (tick) => tick >= domain[0] && tick <= domain[1]
  )
}

/** Higher score → top. Optionally reverse X so “better” is right. */
export function makeScatterScales(
  pad: ScatterPad,
  xDomain: readonly [number, number],
  yDomain: readonly [number, number],
  reverseX: boolean
) {
  const innerW = SCATTER_WIDTH - pad.left - pad.right
  const innerH = SCATTER_HEIGHT - pad.top - pad.bottom
  const xSpan = xDomain[1] - xDomain[0]
  const ySpan = yDomain[1] - yDomain[0]

  const x = (value: number) =>
    pad.left +
    (reverseX
      ? ((xDomain[1] - value) / xSpan) * innerW
      : ((value - xDomain[0]) / xSpan) * innerW)

  const y = (score: number) => pad.top + ((yDomain[1] - score) / ySpan) * innerH

  return { x, y, midX: (pad.left + SCATTER_WIDTH - pad.right) / 2 }
}

export function placeScatterLabels(
  points: ReadonlyArray<ScatterDatum>,
  metricId: string,
  labelSide: MetricLabelSideConfig,
  x: (value: number) => number,
  y: (score: number) => number,
  midX: number
): PlacedScatterLabel[] {
  return points
    .filter((point) => point.showLabel)
    .map((point) => {
      const cx = x(point.x)
      const cy = y(point.score)
      const offset = placeLabel(
        labelSideForMetric(point.name, metricId, labelSide),
        cx,
        cy,
        midX
      )
      return { point, cx, cy, ...offset }
    })
}

export type ScatterSeries = {
  points: ScatterDatum[]
  xDomain: [number, number]
  yDomain: [number, number]
  note: string | null
}

export type ScatterDomainPolicy =
  | {
      /** Zoom to supported providers; hide points outside the padded band. */
      kind: "supported-band"
      /** Multiply supported min X (after floor at 0). */
      xMinFactor: number
      /** Multiply supported max X. */
      xMaxFactor: number
      /** Ensure X span is at least this wide past the min. */
      xMinSpan: number
      /** Cap absolute X max (e.g. ¢/page). */
      xMaxCap: number
      yPadBelow: number
      yPadAbove: number
      noteFor: (args: {
        xMin: number
        xMax: number
        hiddenCount: number
        formatX: (value: number) => string
      }) => string | null
    }
  | {
      /** Drop the slowest outlier(s); keep enough points to read the pack. */
      kind: "drop-slow-tail"
      /** Keep points at or below this factor of the second-slowest X. */
      cutoffFactor: number
      minPoints: number
      xMinFactor: number
      xMaxFactor: number
      yPadBelow: number
      yPadAbove: number
      noteFor: (args: { hiddenNames: string[] }) => string | null
    }

/** ParseBench cost chart: focus the band where supported engines sit. */
export const COST_DOMAIN: ScatterDomainPolicy = {
  kind: "supported-band",
  xMinFactor: 0.45,
  xMaxFactor: 1.55,
  xMinSpan: 0.85,
  xMaxCap: 3,
  yPadBelow: 12,
  yPadAbove: 6,
  noteFor: ({ xMin, xMax, hiddenCount, formatX }) =>
    [
      `Scaled to supported providers (${formatX(xMin)}–${formatX(xMax)}/page)`,
      hiddenCount > 0 ? `${hiddenCount} outliers hidden` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
}

/** Long Extraction: hide the extreme slow tail so the pack is readable. */
export const LATENCY_DOMAIN: ScatterDomainPolicy = {
  kind: "drop-slow-tail",
  cutoffFactor: 1.05,
  minPoints: 3,
  xMinFactor: 0.85,
  xMaxFactor: 1.08,
  yPadBelow: 8,
  yPadAbove: 5,
  noteFor: ({ hiddenNames }) =>
    [
      "Faster is right",
      hiddenNames.length > 0
        ? `${hiddenNames.length} slower outlier hidden (${hiddenNames.join(", ")})`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
}

const FAMILY_COLOR: Array<{ match: (name: string) => boolean; color: string }> =
  [
    { match: (name) => name.startsWith("llamaparse"), color: "#38bdf8" },
    { match: (name) => name.startsWith("datalab"), color: "#a78bfa" },
    { match: (name) => name.startsWith("mistral"), color: "#fbbf24" },
  ]

export function familyScatterColor(name: string): string | null {
  const lower = name.toLowerCase()
  return FAMILY_COLOR.find((family) => family.match(lower))?.color ?? null
}

export function buildScatterSeries(input: {
  entries: ReadonlyArray<BenchmarkEntry>
  metric: BenchmarkMetric
  getX: (entry: BenchmarkEntry) => number | null | undefined
  colorFor: (name: string, supported: boolean) => string
  domain: ScatterDomainPolicy
  formatX: (value: number) => string
  emptyXDomain: [number, number]
}): ScatterSeries {
  const { entries, metric, getX, colorFor, domain, formatX, emptyXDomain } =
    input

  const all: ScatterDatum[] = []
  for (const entry of entries) {
    const score = entry.scores[metric.id]
    const x = getX(entry)
    if (typeof score !== "number" || typeof x !== "number") continue
    const supported = Boolean(resolveSupportedBenchmarkProvider(entry.name))
    all.push({
      name: entry.name,
      score,
      x,
      color: colorFor(entry.name, supported),
      supported,
      showLabel: supported,
    })
  }

  if (all.length === 0) {
    return {
      points: [],
      xDomain: emptyXDomain,
      yDomain: [0, metric.maximum],
      note: null,
    }
  }

  if (domain.kind === "supported-band") {
    return applySupportedBand(all, metric, domain, formatX, emptyXDomain)
  }
  return applyDropSlowTail(all, metric, domain)
}

function applySupportedBand(
  all: ScatterDatum[],
  metric: BenchmarkMetric,
  domain: Extract<ScatterDomainPolicy, { kind: "supported-band" }>,
  formatX: (value: number) => string,
  emptyXDomain: [number, number]
): ScatterSeries {
  const supported = all.filter((point) => point.supported)
  if (supported.length === 0) {
    return {
      points: all,
      xDomain: emptyXDomain,
      yDomain: [0, metric.maximum],
      note: null,
    }
  }

  const costs = supported.map((point) => point.x)
  const scores = supported.map((point) => point.score)
  const costLo = Math.min(...costs)
  const costHi = Math.max(...costs)
  const xMin = Math.max(0, costLo * domain.xMinFactor)
  const xMax = Math.min(
    domain.xMaxCap,
    Math.max(costHi * domain.xMaxFactor, costLo + domain.xMinSpan)
  )
  const yMin = Math.max(0, Math.min(...scores) - domain.yPadBelow)
  const yMax = Math.min(metric.maximum, Math.max(...scores) + domain.yPadAbove)
  const points = all.filter(
    (point) =>
      point.x >= xMin &&
      point.x <= xMax &&
      point.score >= yMin &&
      point.score <= yMax
  )

  return {
    points,
    xDomain: [xMin, xMax],
    yDomain: [yMin, yMax],
    note: domain.noteFor({
      xMin,
      xMax,
      hiddenCount: all.length - points.length,
      formatX,
    }),
  }
}

function applyDropSlowTail(
  all: ScatterDatum[],
  metric: BenchmarkMetric,
  domain: Extract<ScatterDomainPolicy, { kind: "drop-slow-tail" }>
): ScatterSeries {
  const latencies = all.map((point) => point.x).sort((a, b) => a - b)
  const cutoff =
    latencies[Math.max(0, latencies.length - 2)] ?? latencies.at(-1)!
  const inBand = all.filter((point) => point.x <= cutoff * domain.cutoffFactor)
  const pack = inBand.length >= domain.minPoints ? inBand : all
  const hiddenNames = all
    .filter((point) => !pack.some((visible) => visible.name === point.name))
    .map((point) => point.name)

  const packX = pack.map((point) => point.x)
  const packScores = pack.map((point) => point.score)
  const xMin = Math.max(0, Math.min(...packX) * domain.xMinFactor)
  const xMax = Math.max(...packX) * domain.xMaxFactor
  const yMin = Math.max(0, Math.min(...packScores) - domain.yPadBelow)
  const yMax = Math.min(
    metric.maximum,
    Math.max(...packScores) + domain.yPadAbove
  )

  return {
    points: pack,
    xDomain: [xMin, xMax],
    yDomain: [yMin, yMax],
    note: domain.noteFor({ hiddenNames }),
  }
}
