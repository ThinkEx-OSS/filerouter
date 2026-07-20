import type { CSSProperties } from "react"

export function FileRouterLogo({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 354 460"
      role="img"
      aria-label="FileRouter outline logo"
    >
      <g fill="var(--brand)">
        <rect width="157" height="460" rx="22" ry="22" />
        <path d="M 210 0 C 204 0 199 3.5 197 9 C 197 11 197 13 197 15 V 128 C 197 140.2 206.8 150 219 150 H 342 C 347 150 351.5 147 353.2 142.3 C 353.8 137.9 353.6 132.9 350.2 129.5 L 220.5 4 C 217.7 1.4 214 0 210 0 Z" />
        <rect x="197" y="193" width="157" height="267" rx="22" ry="22" />
      </g>
    </svg>
  )
}
