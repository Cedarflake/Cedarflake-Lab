import { useEffect, useRef } from "react"
import type { CSSProperties, ReactNode } from "react"

import { useGameStore } from "@/game/useGameStore"

export function ScreenSurface({ children }: { children: ReactNode }) {
  const status = useGameStore((state) => state.status)
  const impactId = useGameStore((state) => state.screenImpactId)
  const darkness = useGameStore((state) => state.reverseDarkness)
  const sceneRef = useRef<HTMLDivElement>(null)
  const burstRef = useRef<HTMLDivElement>(null)
  const lastImpactRef = useRef(0)
  const interference = 0.06 + darkness * 0.94
  const signalStyle = {
    "--signal-shift": `${interference * 5}px`,
    "--signal-skew": `${interference * 0.35}deg`,
    "--signal-opacity": interference * 0.38,
    "--signal-duration": `${4200 - darkness * 2600}ms`,
  } as CSSProperties

  useEffect(() => {
    if (impactId === 0) lastImpactRef.current = 0
    if (impactId <= lastImpactRef.current || status !== "running") return
    lastImpactRef.current = impactId
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const burst = burstRef.current?.animate(
      [{ opacity: reducedMotion ? 0.12 : 0.55 }, { opacity: 0 }],
      { duration: 360, easing: "ease-out" },
    )
    const distortion = reducedMotion
      ? undefined
      : sceneRef.current?.animate(
          [
            { transform: "translateX(-3px) scale(1.012)", filter: "saturate(0.45) contrast(1.12)" },
            { transform: "translateX(2px) skewX(0.25deg) scale(1.012)", filter: "saturate(0.7)" },
            { transform: "translateX(-1px) scale(1.006)", filter: "none" },
            { transform: "none", filter: "none" },
          ],
          { duration: 280, easing: "steps(1, end)" },
        )
    return () => {
      burst?.cancel()
      distortion?.cancel()
    }
  }, [impactId, status])

  return (
    <div className="screen-surface" style={signalStyle}>
      <div className="screen-tracking">
        <div className="screen-signal" ref={sceneRef}>
          {children}
        </div>
      </div>
      <div
        className="signal-interference"
        data-intensity={interference.toFixed(3)}
        aria-hidden="true"
      />
      <div className="signal-burst" ref={burstRef} aria-hidden="true" />
    </div>
  )
}
