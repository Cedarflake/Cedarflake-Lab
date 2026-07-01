import { useMemo, useRef } from "react"

import { Environment, PerspectiveCamera, Stars } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { Checkpoints } from "@/entities/Checkpoints"
import { DreamObjects } from "@/entities/DreamObjects"
import { PlayerCar } from "@/entities/PlayerCar"
import { Track } from "@/entities/Track"
import { createCheckpoints, createObstacles } from "@/game/generation"
import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { useGameStore } from "@/game/useGameStore"
import { useInputStore } from "@/game/useInputStore"
import { useInput } from "@/game/useInput"
import { clamp, lerp } from "@/game/number"

interface RuntimeState {
  x: number
  velocityX: number
  speed: number
  distance: number
  steering: number
  lastObstacleIndex: number
  lastCheckpointIndex: number
}

const initialRuntime: RuntimeState = {
  x: 0,
  velocityX: 0,
  speed: 0,
  distance: 0,
  steering: 0,
  lastObstacleIndex: -1,
  lastCheckpointIndex: -1,
}

function RacerWorld() {
  const carRef = useRef<Group | null>(null)
  const runtimeRef = useRef<RuntimeState>({ ...initialRuntime })
  const inputRef = useInput()
  const obstacles = useMemo(() => createObstacles(), [])
  const checkpoints = useMemo(() => createCheckpoints(), [])
  const status = useGameStore((state) => state.status)
  const setTelemetry = useGameStore((state) => state.setTelemetry)
  const addScore = useGameStore((state) => state.addScore)
  const damage = useGameStore((state) => state.damage)

  useFrame((state, delta) => {
    const runtime = runtimeRef.current

    if (status !== "running") {
      runtime.speed = lerp(runtime.speed, 0, Math.min(delta * 2.2, 1))
      setTelemetry({ speed: runtime.speed, distance: runtime.distance })
      return
    }

    const keyboardInput = inputRef.current
    const touchInput = useInputStore.getState().input
    const input = {
      steer: clamp(keyboardInput.steer + touchInput.steer, -1, 1),
      throttle: Math.max(keyboardInput.throttle, touchInput.throttle),
      brake: Math.max(keyboardInput.brake, touchInput.brake),
      isDrifting: keyboardInput.isDrifting || touchInput.isDrifting,
    }
    const grip = input.isDrifting ? trackConfig.driftGrip : trackConfig.normalGrip
    const acceleration =
      input.throttle * trackConfig.baseAcceleration - input.brake * trackConfig.braking
    runtime.speed = clamp(
      runtime.speed + acceleration * delta - trackConfig.drag * delta,
      input.throttle > 0 ? 12 : 0,
      trackConfig.maxSpeed,
    )
    runtime.velocityX = lerp(
      runtime.velocityX,
      input.steer * trackConfig.steering * (0.55 + runtime.speed / trackConfig.maxSpeed),
      Math.min(delta * 4.6 * grip, 1),
    )
    runtime.x = clamp(
      runtime.x + runtime.velocityX * delta,
      -trackConfig.roadHalfWidth + 1.05,
      trackConfig.roadHalfWidth - 1.05,
    )
    runtime.distance += runtime.speed * delta
    runtime.steering = lerp(runtime.steering, input.steer, Math.min(delta * 7, 1))

    const car = carRef.current
    if (car) {
      car.position.x = lerp(car.position.x, runtime.x, Math.min(delta * 11, 1))
      car.position.y = 0.62 + Math.sin(runtime.distance * 0.12) * 0.035
      car.rotation.y = -runtime.velocityX * 0.018
    }

    state.camera.position.x = lerp(
      state.camera.position.x,
      runtime.x * 0.38,
      Math.min(delta * 2.4, 1),
    )
    state.camera.position.y = lerp(
      state.camera.position.y,
      5.8 + runtime.speed * 0.015,
      Math.min(delta * 2.4, 1),
    )
    state.camera.position.z = lerp(
      state.camera.position.z,
      10.5 + runtime.speed * 0.025,
      Math.min(delta * 2.4, 1),
    )
    state.camera.lookAt(runtime.x * 0.28, 0.65, -8)

    const nextObstacleIndex = obstacles.findIndex((obstacle, index) => {
      if (index <= runtime.lastObstacleIndex) return false
      return obstacle.distance - runtime.distance < 1.8
    })

    if (nextObstacleIndex >= 0) {
      const obstacle = obstacles[nextObstacleIndex]
      if (obstacle) {
        const obstacleX = obstacle.lane * trackConfig.laneWidth
        const hit = Math.abs(runtime.x - obstacleX) < obstacle.width + 0.9

        if (hit) {
          damage(trackConfig.collisionDamage)
        } else {
          addScore(trackConfig.passScore + runtime.speed * 2, "Clean pass")
        }

        runtime.lastObstacleIndex = nextObstacleIndex
      }
    }

    const nextCheckpointIndex = checkpoints.findIndex((checkpoint, index) => {
      if (index <= runtime.lastCheckpointIndex) return false
      return checkpoint.distance - runtime.distance < 1.5
    })

    if (nextCheckpointIndex >= 0) {
      runtime.lastCheckpointIndex = nextCheckpointIndex
      addScore(trackConfig.checkpointScore + runtime.speed * 6, "Checkpoint slipped through")
    }

    setTelemetry({ speed: runtime.speed, distance: runtime.distance })
  })

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 5.8, 10.5]} fov={54} />
      <color attach="background" args={[dreamPalette.skyTop]} />
      <fog attach="fog" args={[dreamPalette.fog, 24, 170]} />
      <ambientLight intensity={0.82} />
      <directionalLight position={[8, 11, 7]} intensity={2.4} castShadow />
      <pointLight position={[0, 5, 2]} color={dreamPalette.carGlow} intensity={18} distance={16} />
      <Environment preset="sunset" />
      <Stars radius={120} depth={42} count={1400} factor={2.3} saturation={0.2} fade speed={0.28} />
      <Track distance={runtimeRef.current.distance} />
      <DreamObjects distance={runtimeRef.current.distance} obstacles={obstacles} />
      <Checkpoints distance={runtimeRef.current.distance} checkpoints={checkpoints} />
      <PlayerCar
        carRef={carRef}
        steering={runtimeRef.current.steering}
        isDrifting={inputRef.current.isDrifting}
      />
    </>
  )
}

export function LiminalRacerScene() {
  return (
    <Canvas shadows dpr={1} gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}>
      <RacerWorld />
    </Canvas>
  )
}
