import { useEffect, useId, useRef } from "react"
import type { CSSProperties, ReactNode } from "react"

import { resolveScreenSignal } from "@/game/screenSignal"
import { useGameStore } from "@/game/useGameStore"

const signalBlocks = [0, 1, 2, 3, 4, 5]

export function ScreenSurface({ children }: { children: ReactNode }) {
  const status = useGameStore((state) => state.status)
  const impactId = useGameStore((state) => state.screenImpactId)
  const damageId = useGameStore((state) => state.impactId)
  const integrity = useGameStore((state) => state.integrity)
  const darkness = useGameStore((state) => state.reverseDarkness)
  const sceneRef = useRef<HTMLDivElement>(null)
  const colorRef = useRef<HTMLDivElement>(null)
  const blocksRef = useRef<HTMLDivElement>(null)
  const burstRef = useRef<HTMLDivElement>(null)
  const lastImpactRef = useRef(0)
  const lastDamageRef = useRef(0)
  const filterId = useId()
  const signal = resolveScreenSignal(integrity, darkness)
  const signalStyle = {
    "--signal-shift": `${signal.intensity * 5}px`,
    "--signal-skew": `${signal.intensity * 0.35}deg`,
    "--signal-opacity": signal.intensity * 0.38,
    "--signal-duration": `${signal.duration}ms`,
    "--signal-negative": signal.negative,
    "--signal-hue": `${signal.hue}deg`,
    "--signal-saturation": signal.saturation,
    "--signal-fringe": `url("#${filterId}")`,
    "--signal-block-opacity": signal.blockOpacity,
    "--signal-block-scale": 1 + signal.severity * 0.5,
  } as CSSProperties

  useEffect(() => {
    const hasDamage = damageId > lastDamageRef.current
    lastDamageRef.current = damageId
    if (impactId === 0) lastImpactRef.current = 0
    if (impactId <= lastImpactRef.current) return
    lastImpactRef.current = impactId
    if (status === "ready" || status === "paused") return
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const burst = burstRef.current?.animate(
      [{ opacity: reducedMotion ? 0.12 : 0.55 }, { opacity: 0 }],
      { duration: 360, easing: "ease-out" },
    )
    const distortion = reducedMotion
      ? undefined
      : sceneRef.current?.animate(
          [
            { transform: "translateX(-3px) scale(1.012)" },
            { transform: "translateX(2px) skewX(0.25deg) scale(1.012)" },
            { transform: "translateX(-1px) scale(1.006)" },
            { transform: "none" },
          ].map((frame) => ({ ...frame, easing: "steps(1, end)" })),
          { duration: 280 },
        )
    const state = useGameStore.getState()
    const visibility = resolveScreenSignal(state.integrity, state.reverseDarkness).visibleSignal
    const colorBurst =
      hasDamage && !reducedMotion
        ? colorRef.current?.animate(
            [
              {
                filter: `invert(${0.88 * visibility}) hue-rotate(${95 * visibility}deg) saturate(1.6)`,
                offset: 0,
              },
              {
                filter: `invert(${0.88 * visibility}) hue-rotate(${95 * visibility}deg) saturate(1.6)`,
                offset: 0.22,
              },
              {
                filter: `invert(0) hue-rotate(${-85 * visibility}deg) saturate(1.5)`,
                offset: 0.23,
              },
              { filter: `invert(0) hue-rotate(${-25 * visibility}deg) saturate(1.2)`, offset: 0.7 },
              { offset: 1 },
            ].map((frame) => ({ ...frame, easing: "steps(1, end)" })),
            { duration: 480, id: "damage-color-burst" },
          )
        : undefined
    const damageBlocks = hasDamage
      ? blocksRef.current?.animate(
          [{ opacity: reducedMotion ? 0.16 : 0.8 }, { opacity: "var(--signal-block-opacity)" }],
          { duration: reducedMotion ? 600 : 480, easing: "ease-out", id: "damage-block-burst" },
        )
      : undefined
    return () => {
      burst?.cancel()
      distortion?.cancel()
      colorBurst?.cancel()
      damageBlocks?.cancel()
    }
  }, [impactId, damageId, status])

  return (
    <div className="screen-surface" style={signalStyle}>
      <svg className="signal-filter" aria-hidden="true" focusable="false">
        <defs>
          <filter
            id={filterId}
            x="-2%"
            y="-2%"
            width="104%"
            height="104%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            />
            <feOffset dx={signal.fringe} result="red" />
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"
            />
            <feOffset dx={-signal.fringe} result="cyan" />
            <feBlend in="red" in2="cyan" mode="screen" />
          </filter>
        </defs>
      </svg>
      <div className="screen-tracking">
        <div className="screen-signal" ref={sceneRef}>
          <div className="screen-color" ref={colorRef} data-corruption={signal.severity > 0}>
            {children}
          </div>
        </div>
      </div>
      <div
        className="signal-interference"
        data-intensity={signal.intensity.toFixed(3)}
        aria-hidden="true"
      />
      <div className="signal-burst" ref={burstRef} aria-hidden="true" />
      <div className="signal-blocks" ref={blocksRef} aria-hidden="true">
        {signalBlocks.map((block) => (
          <span key={block} className="signal-block" />
        ))}
      </div>
    </div>
  )
}
