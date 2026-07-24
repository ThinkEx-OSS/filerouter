export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((value) => (value + 0.5) / 16))

export const BRAND_RGB = [0, 189, 247] as const

export const clamp01 = (value: number) =>
  value < 0 ? 0 : value > 1 ? 1 : value

export function brandRgb(scale = 1, alpha = 1) {
  return `rgba(${BRAND_RGB.map((channel) => Math.round(channel * scale)).join(",")},${alpha})`
}

export const auraStyle = {
  filter: "blur(15px) brightness(2.9) saturate(3)",
  opacity: 0.1,
  mixBlendMode: "plus-lighter",
  imageRendering: "auto",
} as const

export function prefersReducedMotion() {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  )
}
