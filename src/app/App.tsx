import { Component, lazy, Suspense } from "react"
import type { ReactNode } from "react"

import { useKeyboardInput } from "@/game/useInput"
import { DrivingFeedback } from "@/ui/DrivingFeedback"
import { GameOverlay } from "@/ui/GameOverlay"
import { Hud } from "@/ui/Hud"
import { TouchControls } from "@/ui/TouchControls"

import "./App.css"

const LiminalRacerScene = lazy(() =>
  import("@/scenes/LiminalRacerScene").then((module) => ({
    default: module.LiminalRacerScene,
  })),
)

interface SceneErrorBoundaryProps {
  children: ReactNode
}

interface SceneErrorBoundaryState {
  hasError: boolean
}

class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  override state: SceneErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { hasError: true }
  }

  private reload = () => {
    window.location.reload()
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="scene-error" role="alert">
          <strong>Scene failed to load</strong>
          <button type="button" onClick={this.reload}>
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export function App() {
  useKeyboardInput()

  return (
    <main className="game-shell" tabIndex={-1}>
      <SceneErrorBoundary>
        <Suspense
          fallback={
            <div className="scene-loading" role="status" aria-label="Loading 3D racing scene" />
          }
        >
          <LiminalRacerScene />
        </Suspense>
      </SceneErrorBoundary>
      <DrivingFeedback />
      <Hud />
      <TouchControls />
      <GameOverlay />
    </main>
  )
}
