import { useRef } from "react"
import type { CSSProperties, PointerEvent } from "react"

import { FileRouterLogo } from "@/components/file-router-logo"

const stackLayers = [6, 5, 4, 3, 2, 1, 0] as const

export function FileRouterHeroMark() {
  const stageRef = useRef<HTMLDivElement>(null)

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5

    stageRef.current?.style.setProperty("--pointer-x", `${x * 7}deg`)
    stageRef.current?.style.setProperty("--pointer-y", `${y * -5}deg`)
  }

  function handlePointerLeave() {
    stageRef.current?.style.setProperty("--pointer-x", "0deg")
    stageRef.current?.style.setProperty("--pointer-y", "0deg")
  }

  function replayStackAnimation() {
    const stage = stageRef.current

    if (!stage) return

    stage.classList.remove("file-router-hero-mark__stage--activated")
    void stage.offsetWidth
    stage.classList.add("file-router-hero-mark__stage--activated")
  }

  return (
    <button
      aria-label="Animate FileRouter logo"
      className="file-router-hero-mark"
      onClick={replayStackAnimation}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      type="button"
    >
      <div className="file-router-hero-mark__shadow" />
      <div className="file-router-hero-mark__stage" ref={stageRef}>
        {stackLayers.map((layer) => (
          <FileRouterLogo
            className={`file-router-hero-mark__layer ${
              layer === 0
                ? "file-router-hero-mark__layer--top"
                : "file-router-hero-mark__layer--clone"
            }`}
            key={layer}
            style={{ "--stack-layer": layer } as CSSProperties}
          />
        ))}
      </div>
    </button>
  )
}
