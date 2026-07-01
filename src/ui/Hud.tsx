import { useGameStore } from "@/game/useGameStore"

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

export function Hud() {
  const score = useGameStore((state) => state.score)
  const bestScore = useGameStore((state) => state.bestScore)
  const speed = useGameStore((state) => state.speed)
  const distance = useGameStore((state) => state.distance)
  const integrity = useGameStore((state) => state.integrity)
  const combo = useGameStore((state) => state.combo)
  const driftCharge = useGameStore((state) => state.driftCharge)
  const lastEvent = useGameStore((state) => state.lastEvent)

  return (
    <section className="hud" aria-label="Race telemetry">
      <div className="hud__cluster hud__cluster--primary">
        <span className="hud__label">Score</span>
        <strong>{formatNumber(score)}</strong>
        <small>Best {formatNumber(bestScore)}</small>
      </div>

      <div className="hud__cluster">
        <span className="hud__label">Speed</span>
        <strong>{formatNumber(speed * 3.1)}</strong>
        <small>km/h</small>
      </div>

      <div className="hud__cluster">
        <span className="hud__label">Distance</span>
        <strong>{formatNumber(distance)}</strong>
        <small>meters</small>
      </div>

      <div className="hud__cluster">
        <span className="hud__label">Combo</span>
        <strong>{combo.toFixed(1)}x</strong>
        <small>{lastEvent}</small>
      </div>

      <div className="hud__meters">
        <div className="hud__integrity" aria-label="Vehicle integrity">
          <span style={{ inlineSize: `${integrity}%` }} />
        </div>
        <div className="hud__drift" aria-label="Drift charge">
          <span style={{ inlineSize: `${Math.min((driftCharge / 1600) * 100, 100)}%` }} />
        </div>
      </div>
    </section>
  )
}
