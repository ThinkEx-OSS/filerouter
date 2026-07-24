export type LabelSide = "left" | "right" | "above" | "below" | "auto"

export type LabelAnchor = "start" | "end" | "middle"

export type LabelSideMap = Readonly<Record<string, LabelSide>>

/**
 * Chart label placement config.
 * - `default` applies to every metric tab
 * - `metrics[metricId]` overrides `default` for that tab only
 */
export type MetricLabelSideConfig = {
  readonly default?: LabelSideMap
  readonly metrics?: Readonly<Partial<Record<string, LabelSideMap>>>
}

export type PlacedLabelOffset = {
  x: number
  y: number
  anchor: LabelAnchor
}

const GAP_X = 10
const GAP_Y = 14

/** Resolve pixel offset for a label relative to its point. */
export function placeLabel(
  side: LabelSide,
  cx: number,
  cy: number,
  midX: number
): PlacedLabelOffset {
  const resolved = side === "auto" ? (cx > midX ? "left" : "right") : side

  switch (resolved) {
    case "left":
      return { x: cx - GAP_X, y: cy, anchor: "end" }
    case "right":
      return { x: cx + GAP_X, y: cy, anchor: "start" }
    case "above":
      return { x: cx, y: cy - GAP_Y, anchor: "middle" }
    case "below":
      return { x: cx, y: cy + GAP_Y, anchor: "middle" }
  }
}

export function labelSideForMetric(
  name: string,
  metricId: string,
  config: MetricLabelSideConfig,
  fallback: LabelSide = "auto"
): LabelSide {
  return (
    config.metrics?.[metricId]?.[name] ?? config.default?.[name] ?? fallback
  )
}
