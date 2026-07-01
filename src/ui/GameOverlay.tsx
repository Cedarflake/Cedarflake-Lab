import { useEffect } from "react"

import { useGameStore } from "@/game/useGameStore"

export function GameOverlay() {
  const status = useGameStore((state) => state.status)
  const score = useGameStore((state) => state.score)
  const start = useGameStore((state) => state.start)
  const pause = useGameStore((state) => state.pause)
  const resume = useGameStore((state) => state.resume)
  const restart = useGameStore((state) => state.restart)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (status === "running") pause()
        if (status === "paused") resume()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [pause, resume, status])

  if (status === "running") {
    return (
      <button type="button" className="pause-button" onClick={pause}>
        Pause
      </button>
    )
  }

  if (status === "paused") {
    return (
      <div className="overlay" role="dialog" aria-label="Paused">
        <div className="overlay__panel">
          <p className="overlay__eyebrow">A quiet exit sign hums overhead</p>
          <h1>Liminal Drift</h1>
          <p>Resume before the road forgets where it was going.</p>
          <div className="overlay__actions">
            <button type="button" onClick={resume}>
              Resume
            </button>
            <button type="button" className="button-secondary" onClick={restart}>
              Restart
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === "ended") {
    return (
      <div className="overlay" role="dialog" aria-label="Race ended">
        <div className="overlay__panel">
          <p className="overlay__eyebrow">Signal lost at {Math.round(score)} points</p>
          <h1>The mall closes itself</h1>
          <p>The car is still warm. The corridor is longer than before.</p>
          <div className="overlay__actions">
            <button type="button" onClick={restart}>
              Drive again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overlay" role="dialog" aria-label="Start race">
      <div className="overlay__panel">
        <p className="overlay__eyebrow">Dreamcore night driving</p>
        <h1>Liminal Drift</h1>
        <p>
          Follow the pastel highway through empty atriums, pool-blue tunnels, and checkpoints that
          feel half remembered.
        </p>
        <div className="overlay__actions">
          <button type="button" onClick={start}>
            Start driving
          </button>
        </div>
        <dl className="controls">
          <div>
            <dt>Steer</dt>
            <dd>WASD / Arrows</dd>
          </div>
          <div>
            <dt>Drift</dt>
            <dd>Space / Shift</dd>
          </div>
          <div>
            <dt>Pause</dt>
            <dd>Esc</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
