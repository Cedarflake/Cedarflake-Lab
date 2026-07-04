import { useCallback } from "react"

import { playBackgroundMusic } from "@/app/backgroundMusic"
import {
  EndedDialog,
  PausedDialog,
  PauseButton,
  StartDialog,
} from "@/ui/game-overlay/OverlayDialogs"
import { useDialogFocusTrap } from "@/ui/game-overlay/focusTrap"
import {
  resolveGamepadStatusText,
  useGamepadOverlayControls,
} from "@/ui/game-overlay/gamepadOverlayControls"
import { useOverlayShortcuts } from "@/ui/game-overlay/overlayShortcuts"
import type { RunStatsData } from "@/ui/game-overlay/types"
import { useGameStore } from "@/game/useGameStore"

export function GameOverlay() {
  const status = useGameStore((state) => state.status)
  const stats: RunStatsData = {
    bestDriftScore: useGameStore((state) => state.bestDriftScore),
    bestScore: useGameStore((state) => state.bestScore),
    checkpointCount: useGameStore((state) => state.checkpointCount),
    combo: useGameStore((state) => state.combo),
    distance: useGameStore((state) => state.distance),
    integrity: useGameStore((state) => state.integrity),
    score: useGameStore((state) => state.score),
    topSpeed: useGameStore((state) => state.topSpeed),
  }
  const hasNewBest = useGameStore((state) => state.hasNewBest)
  const start = useGameStore((state) => state.start)
  const pause = useGameStore((state) => state.pause)
  const resume = useGameStore((state) => state.resume)
  const restart = useGameStore((state) => state.restart)
  const dialogRef = useDialogFocusTrap(status)

  const playMusicFromGesture = useCallback(() => {
    void playBackgroundMusic().catch(() => undefined)
  }, [])

  const handleStart = useCallback(() => {
    playMusicFromGesture()
    start()
  }, [playMusicFromGesture, start])

  const handleResume = useCallback(() => {
    playMusicFromGesture()
    resume()
  }, [playMusicFromGesture, resume])

  const handleRestart = useCallback(() => {
    playMusicFromGesture()
    restart()
  }, [playMusicFromGesture, restart])

  const gamepadStatus = useGamepadOverlayControls({
    onPause: pause,
    onRestart: handleRestart,
    onResume: handleResume,
    onStart: handleStart,
    status,
  })

  useOverlayShortcuts({
    onPause: pause,
    onResume: handleResume,
    status,
  })

  if (status === "running") {
    return <PauseButton onPause={pause} />
  }

  if (status === "paused") {
    return (
      <PausedDialog
        dialogRef={dialogRef}
        onRestart={handleRestart}
        onResume={handleResume}
        stats={stats}
      />
    )
  }

  if (status === "ended") {
    return (
      <EndedDialog
        dialogRef={dialogRef}
        hasNewBest={hasNewBest}
        onRestart={handleRestart}
        stats={stats}
      />
    )
  }

  return (
    <StartDialog
      dialogRef={dialogRef}
      gamepadStatusText={resolveGamepadStatusText(gamepadStatus)}
      onStart={handleStart}
    />
  )
}
