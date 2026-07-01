import { lazy, Suspense } from "react"

import { GameOverlay } from "@/ui/GameOverlay"
import { Hud } from "@/ui/Hud"
import { TouchControls } from "@/ui/TouchControls"

import "./App.css"

const LiminalRacerScene = lazy(() =>
  import("@/scenes/LiminalRacerScene").then((module) => ({
    default: module.LiminalRacerScene,
  })),
)

export function App() {
  return (
    <main className="game-shell">
      <Suspense fallback={<div className="scene-loading" aria-hidden="true" />}>
        <LiminalRacerScene />
      </Suspense>
      <Hud />
      <TouchControls />
      <GameOverlay />
    </main>
  )
}
