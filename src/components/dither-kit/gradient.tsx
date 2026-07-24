import { useLayoutEffect, useRef } from "react"

import { cn } from "@/lib/utils"

import { BAYER4, BRAND_RGB } from "./dither"

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
 * Ordered-dither ramp → ImageData → one putImageData.
 * Prefer this for sized/dynamic washes (footer, canvas). For the landing hero,
 * use the static posters in `HeroDitherField` so SSR has pixels immediately.
 */
function paintGradient(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  spec: PaintSpec
): boolean {
  const ctx = canvas.getContext("2d", { alpha: true })
  if (!ctx || width <= 0 || height <= 0) return false

  const cols = Math.min(MAX_COLS, Math.max(4, Math.round(width / spec.cell)))
  const rows = Math.min(MAX_ROWS, Math.max(4, Math.round(height / spec.cell)))

  const image = new ImageData(cols, rows)
  const data = image.data
  const [brandR, brandG, brandB] = BRAND_RGB
  const o = spec.opacity

  for (let y = 0; y < rows; y++) {
    const yT =
      spec.direction === "up"
        ? 1 - (y + 0.5) / rows
        : spec.direction === "down"
          ? (y + 0.5) / rows
          : null
    const bayerRow = BAYER4[y & 3]

    for (let x = 0; x < cols; x++) {
      const t =
        yT ??
        (spec.direction === "left" ? 1 - (x + 0.5) / cols : (x + 0.5) / cols)
      const density = 1 - t
      const lit = density > bayerRow[x & 3]
      const alpha = (lit ? 0.35 + 0.65 * density : 0.12 * density) * o
      if (alpha <= 0.004) continue

      const i = (y * cols + x) * 4
      data[i] = brandR
      data[i + 1] = brandG
      data[i + 2] = brandB
      data[i + 3] = Math.round(alpha * 255)
    }
  }

  if (canvas.width !== cols) canvas.width = cols
  if (canvas.height !== rows) canvas.height = rows
  ctx.putImageData(image, 0, 0)
  return true
}

export function DitherGradient({
  direction = "up",
  cell = 3,
  opacity = 1,
  className,
}: DitherGradientProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastSizeRef = useRef({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    let frame = 0
    const paint = () => {
      const box = wrap.getBoundingClientRect()
      const width = Math.round(box.width)
      const height = Math.round(box.height)
      if (
        width === lastSizeRef.current.width &&
        height === lastSizeRef.current.height
      ) {
        return
      }
      lastSizeRef.current = { width, height }
      paintGradient(canvas, width, height, { direction, cell, opacity })
    }

    paint()

    if (typeof ResizeObserver === "undefined") return

    const ro = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(paint)
    })
    ro.observe(wrap)
    return () => {
      window.cancelAnimationFrame(frame)
      ro.disconnect()
    }
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
