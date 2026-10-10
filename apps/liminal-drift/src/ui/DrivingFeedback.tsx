import { useEffect, useRef } from "react"
import type { CSSProperties } from "react"

import { pulseHaptics } from "@/game/haptics"
import { useGameStore } from "@/game/useGameStore"

export function DrivingFeedback() {
  const status = useGameStore((state) => state.status)
  const integrity = useGameStore((state) => state.integrity)
  const impactId = useGameStore((state) => state.impactId)
  const feedbackId = useGameStore((state) => state.feedbackId)
  const feedbackKind = useGameStore((state) => state.feedbackKind)
  const feedbackPoints = useGameStore((state) => state.feedbackPoints)
  const lastEvent = useGameStore((state) => state.lastEvent)
  const reverseDarkness = useGameStore((state) => state.reverseDarkness)
  const integrityAlertOpacity =
    status === "running" && integrity < 36 ? Math.min((36 - integrity) / 36, 0.72) : 0
  const lastFeedbackIdRef = useRef(0)
  const lastImpactIdRef = useRef(0)

  useEffect(() => {
    if (feedbackId <= 0 || feedbackId === lastFeedbackIdRef.current) {
      return
    }

    lastFeedbackIdRef.current = feedbackId
    pulseHaptics(feedbackKind === "drift" || feedbackKind === "checkpoint" ? [12, 28, 18] : 14)
  }, [feedbackId, feedbackKind])

  useEffect(() => {
    if (impactId <= 0 || impactId === lastImpactIdRef.current) {
      return
    }

    lastImpactIdRef.current = impactId
    pulseHaptics([24, 36, 24])
  }, [impactId])

  return (
    <>
      <div
        className="reverse-vignette"
        aria-hidden="true"
        data-darkness={reverseDarkness.toFixed(3)}
        style={
          {
            opacity: Math.min(1, reverseDarkness * 3),
            "--reverse-clear": `${52 - reverseDarkness * 104}%`,
          } as CSSProperties
        }
      />
      <div
        className="integrity-veil"
        style={{ opacity: integrityAlertOpacity }}
        aria-hidden="true"
      />
      {feedbackId > 0 && feedbackKind ? (
        <>
          <output
            key={`toast-${feedbackId}`}
            className={`feedback-toast feedback-toast--${feedbackKind}`}
            aria-live="polite"
          >
            <span>{lastEvent}</span>
            <strong>+{feedbackPoints.toLocaleString("en-US")}</strong>
          </output>
        </>
      ) : null}
      {impactId > 0 ? (
        <>
          <div key={`impact-${impactId}`} className="impact-flash" aria-hidden="true" />
          <div key={`recovery-${impactId}`} className="recovery-shield" aria-hidden="true" />
        </>
      ) : null}
    </>
  )
}
