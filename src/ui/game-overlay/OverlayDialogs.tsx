import type { RefObject } from "react"

import { formatNumber } from "@/game/format"

import { ControlsLegend } from "./ControlsLegend"
import { RunStats } from "./RunStats"
import type { RunStatsData } from "./types"

interface DialogRefProps {
  dialogRef: RefObject<HTMLDivElement | null>
}

interface StartDialogProps extends DialogRefProps {
  gamepadStatusText: string
  onStart: () => void
}

interface PausedDialogProps extends DialogRefProps {
  onRestart: () => void
  onResume: () => void
  stats: RunStatsData
}

interface EndedDialogProps extends DialogRefProps {
  hasNewBest: boolean
  onRestart: () => void
  stats: RunStatsData
}

interface PauseButtonProps {
  onPause: () => void
}

export function PauseButton({ onPause }: PauseButtonProps) {
  return (
    <button type="button" className="ui-button pause-button" onClick={onPause}>
      Pause
    </button>
  )
}

export function PausedDialog({ dialogRef, onRestart, onResume, stats }: PausedDialogProps) {
  return (
    <div ref={dialogRef} className="overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="glass-panel overlay__panel">
        <p className="overlay__eyebrow">The exit sign is still humming</p>
        <h1>Liminal Drift</h1>
        <p>Resume before the road decides you were never here.</p>
        <RunStats {...stats} showHighlights />
        <div className="overlay__actions">
          <button type="button" className="ui-button" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="ui-button ui-button--secondary" onClick={onRestart}>
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}

export function EndedDialog({ dialogRef, hasNewBest, onRestart, stats }: EndedDialogProps) {
  return (
    <div
      ref={dialogRef}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Race ended"
    >
      <div className="glass-panel overlay__panel">
        <p className="overlay__eyebrow">
          {hasNewBest
            ? "A stronger trace was left behind"
            : `The trace faded at ${Math.round(stats.score)} points`}
        </p>
        <h1>The mall closes itself</h1>
        {hasNewBest ? (
          <p className="overlay__best-badge">Best {formatNumber(stats.bestScore)}</p>
        ) : null}
        <p>The car is still warm. The corridor has learned your route.</p>
        <RunStats {...stats} showBest showHighlights />
        <div className="overlay__actions">
          <button type="button" className="ui-button" onClick={onRestart}>
            Drive again
          </button>
        </div>
      </div>
    </div>
  )
}

export function StartDialog({ dialogRef, gamepadStatusText, onStart }: StartDialogProps) {
  return (
    <div
      ref={dialogRef}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Start race"
    >
      <div className="glass-panel overlay__panel">
        <p className="overlay__eyebrow">A road remembered by nobody</p>
        <h1>Liminal Drift</h1>
        <p>
          Follow the faded highway through empty atriums, gray sinkholes, and exits that keep
          changing their mind.
        </p>
        <div className="overlay__actions">
          <button type="button" className="ui-button" onClick={onStart}>
            Start driving
          </button>
        </div>
        <ControlsLegend />
        <p className="overlay__gamepad-status" aria-live="polite">
          {gamepadStatusText}
        </p>
      </div>
    </div>
  )
}
