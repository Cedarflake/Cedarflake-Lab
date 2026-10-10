import { useMemo, useRef, useState } from "react"

import { PerspectiveCamera as DreiPerspectiveCamera, Stars } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { PerspectiveCamera as ThreePerspectiveCamera } from "three"
import type { DirectionalLight, Group } from "three"

import { BoostGates } from "@/entities/BoostGates"
import { CarMotionTrail } from "@/entities/CarMotionTrail"
import { Checkpoints } from "@/entities/Checkpoints"
import { DreadAtmosphere } from "@/entities/DreadAtmosphere"
import { DreamObjects } from "@/entities/DreamObjects"
import { MemoryShards } from "@/entities/MemoryShards"
import { PlayerCar } from "@/entities/PlayerCar"
import { SkyEyes } from "@/entities/SkyEyes"
import { Track } from "@/entities/Track"
import type { DebugMode } from "@/game/debugMode"
import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { DrivingSimulation } from "@/game/drivingSimulation"
import type { DrivingEvent } from "@/game/drivingSimulation"
import { environmentFogEnd } from "@/game/environment"
import {
  createVisibleBoostGates,
  createVisibleCheckpoints,
  createVisibleMemoryShards,
  createVisibleObstacles,
} from "@/game/generation"
import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { clamp, lerp } from "@/game/number"
import { createRoadWorld, RoadWorldContext } from "@/game/roadWorld"
import { createRoadSeed, roadChunkLength } from "@/game/trackPath"
import { useGameStore } from "@/game/useGameStore"
import { useInputStore } from "@/game/useInputStore"

interface LiminalRacerSceneProps {
  debugMode: DebugMode
  onReady?: () => void
}

function SceneReadyNotifier({ onReady }: { onReady: () => void }) {
  const hasNotified = useRef(false)
  useFrame(() => {
    if (hasNotified.current) return
    hasNotified.current = true
    onReady()
  })
  return null
}

function handleDrivingEvent(event: DrivingEvent) {
  const store = useGameStore.getState()
  switch (event.kind) {
    case "score":
      store.addScore(event.points, event.event)
      break
    case "damage":
      store.damage(event.amount)
      break
    case "repair":
      store.repair(event.amount)
      break
    case "charge":
      store.addDriftCharge(event.amount)
      break
    case "cash-out":
      store.cashOutDrift()
      break
    case "road-end":
      store.endAtRoadBoundary()
      break
    case "impact":
      store.registerScreenImpact()
      break
  }
  return useGameStore.getState().status === "running"
}

function RacerWorld({ debugMode, runId }: { debugMode: DebugMode; runId: number }) {
  const world = useMemo(() => createRoadWorld(createRoadSeed()), [])
  const simulation = useMemo(
    () =>
      new DrivingSimulation(world.road, () => [
        ...world.environment.solids,
        ...[...world.scenerySolids.values()].flat(),
      ]),
    [world],
  )
  const carRef = useRef<Group>(null)
  const lightRef = useRef<DirectionalLight>(null)
  const skyRef = useRef<Group>(null)
  const distanceRef = useRef(0)
  const travelledRef = useRef(0)
  const elapsedTimeRef = useRef(0)
  const speedRef = useRef(0)
  const steeringRef = useRef(0)
  const skidIntensityRef = useRef(0)
  const shardEffectsRef = useRef(simulation.collectedShards)
  const shardIdsRef = useRef(new Set<string>())
  const cameraHeadingRef = useRef(0)
  const lastTelemetryRef = useRef(-1)
  const worldWindowRef = useRef(0)
  const [worldDistance, setWorldDistance] = useState(0)
  const visible = useMemo(
    () => ({
      obstacles: debugMode.noObstacles ? [] : createVisibleObstacles(worldDistance, 120),
      boosts: createVisibleBoostGates(worldDistance, 120),
      checkpoints: createVisibleCheckpoints(worldDistance, 120),
      shards: createVisibleMemoryShards(worldDistance, 120),
    }),
    [debugMode.noObstacles, worldDistance],
  )

  useFrame(({ camera }, delta) => {
    const state = useGameStore.getState()
    // Canvas can commit its new world after the DOM has already restarted the run.
    if (state.runId !== runId || state.status === "paused") return
    const status = state.status
    const dt = Math.min(delta, 0.1)
    const vehicle = simulation.vehicle
    if (status === "running") {
      const { keyboardInput, gamepadInput } = useInputStore.getState()
      simulation.advance(
        dt,
        {
          steer: clamp(keyboardInput.steer + gamepadInput.steer, -1, 1),
          throttle: Math.max(keyboardInput.throttle, gamepadInput.throttle),
          brake: Math.max(keyboardInput.brake, gamepadInput.brake),
          isDrifting: keyboardInput.isDrifting || gamepadInput.isDrifting,
        },
        debugMode.noObstacles,
        handleDrivingEvent,
      )
    }
    world.elapsed = simulation.elapsed
    world.isOffRoad = simulation.isOffRoad
    world.distance = simulation.progress
    world.vehicleX = vehicle.x
    world.vehicleZ = vehicle.z
    world.road.ensure(simulation.progress + 1100)
    world.environment.update(vehicle.x, vehicle.z, world.road)
    distanceRef.current = simulation.progress
    travelledRef.current = vehicle.travelled
    elapsedTimeRef.current = simulation.elapsed
    speedRef.current = vehicle.speed
    steeringRef.current = vehicle.steering
    skidIntensityRef.current = clamp(Math.abs(vehicle.slipAngle) * 2.4, 0, 1)
    shardIdsRef.current = new Set(simulation.collectedShards.keys())

    const nextOriginX = Math.floor(vehicle.x / 128) * 128
    const nextOriginZ = Math.floor(vehicle.z / 128) * 128
    camera.position.x -= nextOriginX - world.origin.x
    camera.position.z -= nextOriginZ - world.origin.z
    world.origin.x = nextOriginX
    world.origin.z = nextOriginZ
    const x = vehicle.x - world.origin.x
    const z = vehicle.z - world.origin.z
    const groundY = simulation.isOffRoad
      ? resolveDesertGroundHeight(simulation.projection.offset, simulation.projection.distance)
      : 0
    const car = carRef.current
    if (car) {
      car.position.set(x, groundY + 0.59, z)
      car.rotation.set(0, vehicle.heading, 0)
      car.userData = {
        heading: vehicle.heading,
        offset: simulation.projection.offset,
        worldX: vehicle.x,
        worldZ: vehicle.z,
        slipAngle: vehicle.slipAngle,
      }
    }

    const forwardSpeed =
      -vehicle.velocityX * Math.sin(vehicle.heading) - vehicle.velocityZ * Math.cos(vehicle.heading)
    const movementHeading =
      forwardSpeed > 3 ? Math.atan2(-vehicle.velocityX, -vehicle.velocityZ) : vehicle.heading
    const headingDelta = Math.atan2(
      Math.sin(movementHeading - cameraHeadingRef.current),
      Math.cos(movementHeading - cameraHeadingRef.current),
    )
    cameraHeadingRef.current += headingDelta * (1 - Math.exp(-dt * 3.5))
    const heading = cameraHeadingRef.current
    const back = 10.5 + vehicle.speed * 0.035
    const blend = status === "ready" ? 1 : 1 - Math.exp(-dt * 7)
    camera.position.x = lerp(camera.position.x, x + Math.sin(heading) * back, blend)
    camera.position.y = lerp(camera.position.y, 5.4 + vehicle.speed * 0.012, blend)
    camera.position.z = lerp(camera.position.z, z + Math.cos(heading) * back, blend)
    camera.lookAt(x - Math.sin(heading) * 16, 1, z - Math.cos(heading) * 16)
    if (camera instanceof ThreePerspectiveCamera) {
      camera.fov = lerp(
        camera.fov,
        51 + Math.min(vehicle.speed / trackConfig.maxSpeed, 1.2) * 5,
        blend,
      )
      camera.updateProjectionMatrix()
    }
    skyRef.current?.position.copy(camera.position)
    const light = lightRef.current
    if (light) {
      light.position.set(x - 42, 90, z + 25)
      light.target.position.set(x, 0, z)
      light.target.updateMatrixWorld()
    }
    const windowDistance = Math.floor(simulation.progress / roadChunkLength) * roadChunkLength
    if (windowDistance !== worldWindowRef.current) {
      worldWindowRef.current = windowDistance
      setWorldDistance(windowDistance)
    }
    if (simulation.elapsed - lastTelemetryRef.current >= 0.1) {
      lastTelemetryRef.current = simulation.elapsed
      const bend = world.road.sample(simulation.projection.distance + 45).curvature
      const currentBend = simulation.projection.curvature
      const activeBend = Math.abs(currentBend) > Math.abs(bend) ? currentBend : bend
      useGameStore.getState().setTelemetry({
        speed: vehicle.speed,
        distance: simulation.progress,
        roadOffset: simulation.projection.offset,
        reverseDarkness: simulation.reverseDarkness,
        roadHint: simulation.isOffRoad
          ? "Off road · steer back"
          : activeBend < -0.002
            ? "Right bend · ease off"
            : activeBend > 0.002
              ? "Left bend · ease off"
              : "Open road",
      })
    }
  }, -1)

  return (
    <RoadWorldContext.Provider value={world}>
      <DreiPerspectiveCamera makeDefault position={[0, 5.4, 11]} fov={51} near={0.5} far={420} />
      <color attach="background" args={[dreamPalette.fog]} />
      <fog attach="fog" args={[dreamPalette.fog, 55, environmentFogEnd]} />
      <ambientLight intensity={0.5} />
      <hemisphereLight
        color={dreamPalette.dreamPink}
        groundColor={dreamPalette.dreamBlue}
        intensity={0.35}
      />
      <directionalLight
        ref={lightRef}
        castShadow
        color="#d7b7bd"
        position={[-12, 22, 8]}
        intensity={2.15}
        shadow-camera-bottom={-95}
        shadow-camera-top={95}
        shadow-camera-left={-95}
        shadow-camera-right={95}
        shadow-camera-far={240}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0003}
      />
      <group ref={skyRef}>
        <Stars radius={190} depth={20} count={400} factor={1.6} saturation={0.05} fade speed={0} />
      </group>
      <SkyEyes />
      <DreadAtmosphere distanceRef={distanceRef} speedRef={speedRef} />
      <Track distance={worldDistance} />
      <BoostGates boostGates={visible.boosts} />
      <MemoryShards
        collectedMemoryShardEffectsRef={shardEffectsRef}
        collectedMemoryShardIdsRef={shardIdsRef}
        elapsedTimeRef={elapsedTimeRef}
        memoryShards={visible.shards}
      />
      <DreamObjects distanceRef={distanceRef} obstacles={visible.obstacles} />
      <Checkpoints checkpoints={visible.checkpoints} />
      <CarMotionTrail vehicle={simulation.vehicle} />
      <PlayerCar
        carRef={carRef}
        distanceRef={travelledRef}
        skidIntensityRef={skidIntensityRef}
        steeringRef={steeringRef}
      />
    </RoadWorldContext.Provider>
  )
}

export function LiminalRacerScene({ debugMode, onReady }: LiminalRacerSceneProps) {
  const runId = useGameStore((state) => state.runId)
  return (
    <Canvas
      aria-label="Liminal Drift 3D racing scene"
      dpr={1}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      shadows="percentage"
    >
      <RacerWorld key={runId} debugMode={debugMode} runId={runId} />
      {onReady ? <SceneReadyNotifier onReady={onReady} /> : null}
    </Canvas>
  )
}
