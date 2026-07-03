import { useGameStore } from "@/game/useGameStore"

import "./DrivingFeedback.css"

export function DrivingFeedback() {
  const speed = useGameStore((state) => state.speed)
  const status = useGameStore((state) => state.status)
  const impactId = useGameStore((state) => state.impactId)
  const feedbackId = useGameStore((state) => state.feedbackId)
  const feedbackKind = useGameStore((state) => state.feedbackKind)
  const opacity = status === "running" ? Math.min(speed / 90, 0.42) : 0

  return (
    <>
      <div className="speed-veil" style={{ opacity }} aria-hidden="true" />
      {feedbackId > 0 && feedbackKind ? (
        <div
          key={feedbackId}
          className={`feedback-ripple feedback-ripple--${feedbackKind}`}
          aria-hidden="true"
        />
      ) : null}
      {impactId > 0 ? <div key={impactId} className="impact-flash" aria-hidden="true" /> : null}
    </>
  )
}
