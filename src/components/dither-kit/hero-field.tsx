import { DitherGradient } from "./gradient"

const leftMask =
  "radial-gradient(ellipse at left 78%, black 0%, rgba(0, 0, 0, 0.9) 28%, transparent 72%)"
const rightMask =
  "radial-gradient(ellipse at right 78%, black 0%, rgba(0, 0, 0, 0.9) 28%, transparent 72%)"

export function HeroDitherField() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-y-0 left-0 w-[46%] opacity-[0.18] sm:w-[36%] sm:opacity-55"
        style={{ maskImage: leftMask, WebkitMaskImage: leftMask }}
      >
        <DitherGradient cell={6} direction="right" opacity={0.28} />
      </div>
      <div
        className="absolute inset-y-0 right-0 w-[46%] opacity-[0.18] sm:w-[36%] sm:opacity-55"
        style={{ maskImage: rightMask, WebkitMaskImage: rightMask }}
      >
        <DitherGradient cell={6} direction="left" opacity={0.28} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
    </div>
  )
}
