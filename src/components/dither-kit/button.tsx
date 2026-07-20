import * as React from "react"

import { cn } from "./lib"
import { rgb } from "./palette"
import {
  BAYER4,
  clamp01,
  fillOf,
  type PixelBloom,
  type PixelColor,
  pixelBloomStyle,
  pixelPrefersReducedMotion,
} from "./pixel"

export type DitherButtonProps = React.ComponentProps<"button"> & {
  asChild?: boolean
  bloom?: PixelBloom
  color?: PixelColor
}

type Interaction = "idle" | "hover" | "pressed"

type SlottableProps = {
  children?: React.ReactNode
  className?: string
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>
  onKeyUp?: React.KeyboardEventHandler<HTMLElement>
  onPointerDown?: React.PointerEventHandler<HTMLElement>
  onPointerEnter?: React.PointerEventHandler<HTMLElement>
  onPointerLeave?: React.PointerEventHandler<HTMLElement>
  onPointerUp?: React.PointerEventHandler<HTMLElement>
}

const DITHER_STATE: Record<
  Interaction,
  { density: number; darkScale: number }
> = {
  idle: { density: 0.48, darkScale: 0.96 },
  hover: { density: 0.62, darkScale: 0.88 },
  pressed: { density: 0.76, darkScale: 0.8 },
}

const baseClassName =
  "relative isolate inline-flex shrink-0 items-center justify-center overflow-hidden rounded-none border border-transparent bg-primary bg-clip-padding text-primary-foreground whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0"

function ReactiveDitherSurface({
  bloom,
  color,
  interaction,
}: {
  bloom: PixelBloom
  color: PixelColor
  interaction: Interaction
}) {
  const wrapRef = React.useRef<HTMLSpanElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const bloomRef = React.useRef<HTMLCanvasElement>(null)
  const densityRef = React.useRef(DITHER_STATE.idle.density)
  const darkScaleRef = React.useRef(DITHER_STATE.idle.darkScale)

  React.useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    let animationFrame = 0
    const targetState = DITHER_STATE[interaction]
    const startDensity = densityRef.current
    const startDarkScale = darkScaleRef.current
    const startTime = window.performance.now()

    const paint = (density: number, darkScale: number) => {
      const box = wrap.getBoundingClientRect()
      const width = box.width
      const height = box.height
      if (width <= 0 || height <= 0) return

      const cell = 3
      const cols = Math.max(4, Math.round(width / cell))
      const rows = Math.max(4, Math.round(height / cell))
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      canvas.width = cols
      canvas.height = rows
      const fill = fillOf(color)

      for (let y = 0; y < rows; y++) {
        const verticalBias = 0.22 - ((y + 0.5) / rows) * 0.44
        const rowDensity = clamp01(density + verticalBias)

        for (let x = 0; x < cols; x++) {
          const threshold = BAYER4[y & 3][x & 3]
          const transition = clamp01((rowDensity - threshold + 0.1) / 0.2)
          const softened = transition * transition * (3 - 2 * transition)
          const scale = darkScale + (1 - darkScale) * softened
          ctx.fillStyle = rgb(fill, scale)
          ctx.fillRect(x, y, 1, 1)
        }
      }

      const bloomCanvas = bloomRef.current
      const bloomCtx = bloomCanvas?.getContext("2d")
      if (bloomCanvas && bloomCtx) {
        bloomCanvas.width = cols
        bloomCanvas.height = rows
        bloomCtx.drawImage(canvas, 0, 0)
      }
    }

    const animate = (now: number) => {
      const duration = interaction === "pressed" ? 160 : 280
      const progress = clamp01((now - startTime) / duration)
      const eased = 1 - (1 - progress) ** 3
      densityRef.current =
        startDensity + (targetState.density - startDensity) * eased
      darkScaleRef.current =
        startDarkScale + (targetState.darkScale - startDarkScale) * eased
      paint(densityRef.current, darkScaleRef.current)

      if (progress < 1) animationFrame = window.requestAnimationFrame(animate)
    }

    if (pixelPrefersReducedMotion()) {
      densityRef.current = targetState.density
      darkScaleRef.current = targetState.darkScale
      paint(targetState.density, targetState.darkScale)
    } else {
      animationFrame = window.requestAnimationFrame(animate)
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() =>
            paint(densityRef.current, darkScaleRef.current)
          )
    resizeObserver?.observe(wrap)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver?.disconnect()
    }
  }, [color, interaction])

  const bloomStyle = pixelBloomStyle(bloom)

  return (
    <span
      ref={wrapRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />
      {bloomStyle && (
        <canvas
          ref={bloomRef}
          className="absolute inset-0 h-full w-full"
          style={bloomStyle}
        />
      )}
    </span>
  )
}

export function DitherButton({
  asChild = false,
  bloom = "off",
  children,
  className,
  color = "blue",
  onKeyDown,
  onKeyUp,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerUp,
  ...props
}: DitherButtonProps) {
  const [hovered, setHovered] = React.useState(false)
  const [pressed, setPressed] = React.useState(false)
  const child = asChild
    ? (React.Children.only(children) as React.ReactElement<SlottableProps>)
    : null
  const interaction: Interaction = pressed
    ? "pressed"
    : hovered
      ? "hover"
      : "idle"

  const content = (
    <>
      <ReactiveDitherSurface
        bloom={bloom}
        color={color}
        interaction={interaction}
      />
      <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
        {child ? child.props.children : children}
      </span>
    </>
  )

  const interactionProps: SlottableProps = {
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") setPressed(true)
      child?.props.onKeyDown?.(event)
      onKeyDown?.(event as React.KeyboardEvent<HTMLButtonElement>)
    },
    onKeyUp: (event) => {
      setPressed(false)
      child?.props.onKeyUp?.(event)
      onKeyUp?.(event as React.KeyboardEvent<HTMLButtonElement>)
    },
    onPointerDown: (event) => {
      setPressed(true)
      child?.props.onPointerDown?.(event)
      onPointerDown?.(event as React.PointerEvent<HTMLButtonElement>)
    },
    onPointerEnter: (event) => {
      setHovered(true)
      child?.props.onPointerEnter?.(event)
      onPointerEnter?.(event as React.PointerEvent<HTMLButtonElement>)
    },
    onPointerLeave: (event) => {
      setHovered(false)
      setPressed(false)
      child?.props.onPointerLeave?.(event)
      onPointerLeave?.(event as React.PointerEvent<HTMLButtonElement>)
    },
    onPointerUp: (event) => {
      setPressed(false)
      child?.props.onPointerUp?.(event)
      onPointerUp?.(event as React.PointerEvent<HTMLButtonElement>)
    },
  }

  if (child) {
    return React.cloneElement(child, {
      ...props,
      ...interactionProps,
      className: cn(baseClassName, child.props.className, className),
      children: content,
    })
  }

  return (
    <button
      className={cn(baseClassName, className)}
      {...props}
      {...interactionProps}
    >
      {content}
    </button>
  )
}
