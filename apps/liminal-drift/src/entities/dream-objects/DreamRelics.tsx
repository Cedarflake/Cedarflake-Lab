import { useMemo } from "react"
import type { RefObject } from "react"

import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { dreamPalette, sceneryConfig, trackConfig } from "@/game/gameConfig"

import { ModelDetails } from "../ModelDetails"

import { createSideSceneryItems } from "./shared"
import { useWorldScenery } from "./useWorldScenery"

interface DreamRelicsProps {
  distanceRef: RefObject<number>
}

interface DreamRelicNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

interface DreamRelicMotion {
  baseYaw: number
  hoverPhase: number
  hoverSpeed: number
  hoverWaveMix: number
  pitchPhase: number
  pitchSpeed: number
  rollPhase: number
  rollSpeed: number
  spinDirection: -1 | 1
  spinPhase: number
  spinSpeed: number
}

const { dreamRelics } = sceneryConfig

function createStableNoise(seed: number) {
  return Math.abs(Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1
}

function createDreamRelicMotions(length: number): DreamRelicMotion[] {
  return Array.from({ length }, (_, index) => {
    const first = createStableNoise(index + 1.17)
    const second = createStableNoise(index + 9.43)
    const third = createStableNoise(index + 17.91)
    const fourth = createStableNoise(index + 29.35)
    const fifth = createStableNoise(index + 43.78)
    const spinDirection = createStableNoise(index + 61.12) > 0.5 ? 1 : -1

    return {
      baseYaw: -0.44 + first * 0.88,
      hoverPhase: second * Math.PI * 2,
      hoverSpeed: 0.54 + third * 0.46,
      hoverWaveMix: 0.42 + fourth * 0.3,
      pitchPhase: fifth * Math.PI * 2,
      pitchSpeed: 0.38 + first * 0.34,
      rollPhase: third * Math.PI * 2,
      rollSpeed: 0.44 + second * 0.32,
      spinDirection,
      spinPhase: fourth * Math.PI * 2,
      spinSpeed: 0.08 + fifth * 0.24,
    }
  })
}

function FloatingDoorNode({ index }: { index: number }) {
  const isBlue = index % 2 === 0

  return (
    <group>
      <ModelDetails
        parts={[
          { position: [0, -1.24, 0], size: [1.44, 0.13, 0.34], color: "#a79a93" },
          { position: [0, 1.39, 0], size: [1.68, 0.14, 0.26], color: "#b5a7a0" },
          { position: [0.43, -0.12, 0.13], size: [0.045, 0.18, 0.045], color: "#6f646a" },
          { position: [0.35, -0.08, 0.19], size: [0.18, 0.04, 0.09], color: "#bab1a1" },
          ...[-1, 1].flatMap((side): Parameters<typeof ModelDetails>[0]["parts"] => [
            { position: [side * 0.6, 0, 0.12], size: [0.035, 2.5, 0.04], color: "#d0bab1" },
            { position: [-0.53, side * 0.8, 0.12], size: [0.08, 0.18, 0.06], color: "#6f646a" },
            {
              position: [0, side * 0.58, 0.02],
              size: [0.67, 0.7, 0.05],
              color: isBlue ? "#83919a" : "#a18891",
            },
            { position: [0, side * 0.93, 0.06], size: [0.72, 0.035, 0.045], color: "#c2b0a7" },
          ]),
        ]}
      />
      <mesh castShadow receiveShadow position={[-0.62, 0, 0]}>
        <boxGeometry args={[0.18, 2.6, 0.18]} />
        <meshStandardMaterial
          color={isBlue ? dreamPalette.dreamBlue : dreamPalette.dreamPink}
          emissive={isBlue ? dreamPalette.dreamBlue : dreamPalette.dreamPink}
          emissiveIntensity={0.12}
          roughness={0.58}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[0.62, 0, 0]}>
        <boxGeometry args={[0.18, 2.6, 0.18]} />
        <meshStandardMaterial
          color={isBlue ? dreamPalette.dreamBlue : dreamPalette.dreamPink}
          emissive={isBlue ? dreamPalette.dreamBlue : dreamPalette.dreamPink}
          emissiveIntensity={0.12}
          roughness={0.58}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.22, 0]}>
        <boxGeometry args={[1.42, 0.18, 0.18]} />
        <meshStandardMaterial
          color={dreamPalette.dreamViolet}
          emissive={dreamPalette.dreamViolet}
          emissiveIntensity={0.16}
          roughness={0.5}
        />
      </mesh>
      <mesh position={[0, 0.16, -0.035]}>
        <boxGeometry args={[1.04, 2.3, 0.075]} />
        <meshStandardMaterial color={isBlue ? "#798b91" : "#98808a"} roughness={0.9} />
      </mesh>
    </group>
  )
}

function MemoryWindowNode({ index }: { index: number }) {
  const tint = index % 2 === 0 ? dreamPalette.lemon : dreamPalette.mint

  return (
    <group>
      <ModelDetails
        parts={[
          { position: [0, -0.72, 0.08], size: [2.62, 0.16, 0.5], color: "#b1a59a" },
          { position: [0, 0, 0.13], size: [0.06, 1.1, 0.1], color: "#b6aca0" },
          { position: [0, 0, 0.14], size: [2.1, 0.055, 0.1], color: "#b6aca0" },
          ...[-1, 1].flatMap((side): Parameters<typeof ModelDetails>[0]["parts"] => [
            { position: [side * 1.07, 0, 0.12], size: [0.055, 1.15, 0.1], color: "#b6aca0" },
            { position: [0, side * 0.53, 0.12], size: [2.1, 0.045, 0.1], color: "#b6aca0" },
          ]),
        ]}
      />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.35, 1.34, 0.12]} />
        <meshStandardMaterial
          color={tint}
          emissive={tint}
          emissiveIntensity={0.1}
          roughness={0.68}
        />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[1.74, 0.78, 0.04]} />
        <meshStandardMaterial color="#576977" roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh position={[-0.42, 0.08, 0.11]}>
        <boxGeometry args={[0.62, 0.08, 0.035]} />
        <meshBasicMaterial color="#7f7184" transparent opacity={0.44} />
      </mesh>
      <mesh position={[0.36, -0.16, 0.11]}>
        <boxGeometry args={[0.84, 0.07, 0.035]} />
        <meshBasicMaterial color="#7f7184" transparent opacity={0.34} />
      </mesh>
    </group>
  )
}

function BrokenStairNode() {
  return (
    <group rotation={[0, 0, -0.16]}>
      <ModelDetails
        parts={[
          {
            position: [0.72, 0.1, -0.27],
            size: [2.5, 0.12, 0.12],
            rotation: [0, 0.36, 0.44],
            color: "#776e78",
          },
          {
            position: [0.72, 0.98, -0.6],
            size: [2.2, 0.07, 0.07],
            rotation: [0, 0.36, 0.44],
            color: "#afa19f",
          },
          ...[0, 1, 2, 3].flatMap((step): Parameters<typeof ModelDetails>[0]["parts"] => [
            {
              position: [step * 0.48, step * 0.24 + 0.07, -step * 0.18 + 0.2],
              size: [0.78, 0.025, 0.05],
              color: "#c3b1a5",
            },
            {
              position: [step * 0.48, step * 0.24 + 0.46, -step * 0.18 - 0.28],
              size: [0.055, 0.85, 0.055],
              color: "#92858e",
            },
          ]),
        ]}
      />
      {[0, 1, 2, 3].map((step) => (
        <mesh
          key={step}
          castShadow
          receiveShadow
          position={[step * 0.48, step * 0.24, -step * 0.18]}
        >
          <boxGeometry args={[0.78, 0.12, 0.54]} />
          <meshStandardMaterial
            color={dreamPalette.ruin}
            emissive={dreamPalette.dreamPink}
            emissiveIntensity={0.04 + step * 0.018}
            roughness={0.78}
          />
        </mesh>
      ))}
    </group>
  )
}

function DreamRelicNode({ index, nodeRef }: DreamRelicNodeProps) {
  const variant = index % 3

  return (
    <group ref={nodeRef} scale={0.82 + (index % 4) * 0.08}>
      {variant === 0 && <FloatingDoorNode index={index} />}
      {variant === 1 && <MemoryWindowNode index={index} />}
      {variant === 2 && <BrokenStairNode />}
    </group>
  )
}

export function DreamRelics({ distanceRef }: DreamRelicsProps) {
  const dreamRelicItems = useMemo(() => createSideSceneryItems(dreamRelics.count), [])
  const dreamRelicMotions = useMemo(() => createDreamRelicMotions(dreamRelics.count), [])
  const setDreamRelicRef = useWorldScenery({
    cycleDistance: dreamRelics.cycleDistance,
    distanceRef,
    items: dreamRelicItems,
    originDistance: ({ index }) => dreamRelics.originStart + index * dreamRelics.spacing,
    update: ({ elapsedTime, item, node, z }) => {
      const { index, side } = item
      const motion = dreamRelicMotions[index]
      if (!motion) return

      const sideBand = index % dreamRelics.sideBandCount
      const x =
        side *
        (trackConfig.roadHalfWidth +
          dreamRelics.baseSideOffset +
          sideBand * dreamRelics.sideBandOffset)
      const groundY = resolveDesertGroundHeight(x, -z)
      const hoverPhase = elapsedTime * motion.hoverSpeed + motion.hoverPhase
      const spin = elapsedTime * motion.spinSpeed * motion.spinDirection + motion.spinPhase
      const pitchPhase = elapsedTime * motion.pitchSpeed + motion.pitchPhase
      const rollPhase = elapsedTime * motion.rollSpeed + motion.rollPhase
      const hoverY = Math.sin(hoverPhase) * 0.38 + Math.sin(hoverPhase * motion.hoverWaveMix) * 0.2

      node.position.set(
        x,
        groundY +
          dreamRelics.baseHeight +
          (index % dreamRelics.heightBandCount) * dreamRelics.heightBandOffset +
          hoverY,
        z,
      )
      node.rotation.set(
        Math.sin(pitchPhase) * 0.11,
        side * (0.42 + sideBand * 0.08) + motion.baseYaw + spin,
        Math.cos(rollPhase) * 0.09,
      )
    },
  })

  return (
    <>
      {dreamRelicItems.map(({ index }) => (
        <DreamRelicNode
          key={index}
          index={index}
          nodeRef={(node) => {
            setDreamRelicRef(index, node)
          }}
        />
      ))}
    </>
  )
}
