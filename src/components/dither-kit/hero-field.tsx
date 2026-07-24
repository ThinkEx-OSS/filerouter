/**
 * Hero atmosphere via pre-rendered Bayer dither posters.
 *
 * Why not canvas here: the page is SSR’d, so <canvas> is blank until JS runs.
 * Soft CSS washes under a translucent canvas also look wrong (different texture).
 * Guidance for progressive canvas UIs is a matching poster asset; for a static
 * decorative field the poster *is* the final render — scale with pixelated CSS.
 *
 * Assets: `public/dither/hero-*.png` (same algorithm as DitherGradient).
 */
const leftMask =
  "radial-gradient(ellipse at left 70%, black 0%, rgba(0, 0, 0, 0.85) 18%, transparent 58%)"
const rightMask =
  "radial-gradient(ellipse at right 70%, black 0%, rgba(0, 0, 0, 0.85) 18%, transparent 58%)"

export function HeroDitherField() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-y-0 left-0 w-[46%] opacity-[0.14] sm:w-[36%] sm:opacity-28"
        style={{ maskImage: leftMask, WebkitMaskImage: leftMask }}
      >
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="async"
          src="/dither/hero-left.png?v=4"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
      <div
        className="absolute inset-y-0 right-0 w-[46%] opacity-[0.14] sm:w-[36%] sm:opacity-28"
        style={{ maskImage: rightMask, WebkitMaskImage: rightMask }}
      >
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="async"
          src="/dither/hero-right.png?v=4"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
    </div>
  )
}
