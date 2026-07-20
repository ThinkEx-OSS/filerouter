import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { BAYER4, brandRgb } from "./dither"

// Backing-resolution caps — a background wash never needs more cells than this.
const MAX_COLS = 960
const MAX_ROWS = 600

export type GradientDirection = "up" | "down" | "left" | "right"

export type DitherGradientProps = {
  direction?: GradientDirection
  cell?: number
  opacity?: number
  className?: string
}

type PaintSpec = {
  direction: GradientDirection
  cell: number
  opacity: number
}

/**
 * Paint the ordered-dither ramp onto a low-res backing canvas sized from the
 * wrapper's box. Static — one paint per prop/size change, no animation loop,
 * so it's free to use as a page-wide background.
 */
function paintGradient(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  spec: PaintSpec
): void {
  const ctx = canvas.getContext("2d")
  if (!ctx || width <= 0 || height <= 0) return
  const cols = Math.min(MAX_COLS, Math.max(4, Math.round(width / spec.cell)))
  const rows = Math.min(MAX_ROWS, Math.max(4, Math.round(height / spec.cell)))
  canvas.width = cols
  canvas.height = rows

  const o = spec.opacity

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // t runs 0 at the `from` edge → 1 at the `to` edge.
      const t =
        spec.direction === "up"
          ? 1 - (y + 0.5) / rows
          : spec.direction === "down"
            ? (y + 0.5) / rows
            : spec.direction === "left"
              ? 1 - (x + 0.5) / cols
              : (x + 0.5) / cols
      const density = 1 - t
      const lit = density > BAYER4[y & 3][x & 3]
      const alpha = (lit ? 0.35 + 0.65 * density : 0.12 * density) * o
      if (alpha <= 0.004) continue
      ctx.fillStyle = brandRgb(1, alpha)
      ctx.fillRect(x, y, 1, 1)
    }
  }
}

/**
 * Dithered gradient wash — the charts' ordered-dither texture as a background.
 * Fills its nearest positioned ancestor (footer glows, section fades, card
 * backdrops). Dissolves the brand blue into transparency.
 */
export function DitherGradient({
  direction = "up",
  cell = 3,
  opacity = 1,
  className,
}: DitherGradientProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const paint = () => {
      const box = wrap.getBoundingClientRect()
      paintGradient(canvas, box.width, box.height, {
        direction,
        cell,
        opacity,
      })
    }
    paint()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(paint)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [direction, cell, opacity])

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  )
}
