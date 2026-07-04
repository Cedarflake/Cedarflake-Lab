import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { dreamPalette, trackConfig } from "@/game/gameConfig"

import { createSideSceneryItems, resolveSceneryZ } from "./shared"

interface DreamRelicsProps {
  distanceRef: RefObject<number>
}

interface DreamRelicNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

const dreamRelicCycleDistance = 620

function FloatingDoorNode({ index }: { index: number }) {
  const isBlue = index % 2 === 0

  return (
    <group>
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
        <boxGeometry args={[0.86, 1.86, 0.035]} />
        <meshBasicMaterial color="#fff7dc" transparent opacity={0.16} />
      </mesh>
    </group>
  )
}

function MemoryWindowNode({ index }: { index: number }) {
  const tint = index % 2 === 0 ? dreamPalette.lemon : dreamPalette.mint

  return (
    <group>
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
        <meshBasicMaterial color="#ffffff" transparent opacity={0.24} />
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
  const floatTimeRef = useRef(0)
  const dreamRelicRefs = useRef<Array<Group | null>>([])
  const dreamRelics = useMemo(() => createSideSceneryItems(28), [])

  useFrame((_, delta) => {
    const distance = distanceRef.current
    floatTimeRef.current += Math.min(delta, 0.1)
    const floatTime = floatTimeRef.current

    dreamRelics.forEach(({ index, side }) => {
      const relic = dreamRelicRefs.current[index]
      if (!relic) return

      const sideBand = index % 5
      const z = resolveSceneryZ(48 + index * 24, distance, 0.64, dreamRelicCycleDistance)
      const x = side * (trackConfig.roadHalfWidth + 13.5 + sideBand * 4.6)
      const groundY = resolveDesertGroundHeight(x, z)
      const floatPhase = floatTime * (0.74 + (index % 4) * 0.06) + index * 0.78
      const spin = floatTime * side * (0.18 + (index % 5) * 0.018)
      const hoverY = Math.sin(floatPhase) * 0.44 + Math.sin(floatPhase * 0.52) * 0.16

      relic.position.set(x, groundY + 2.85 + (index % 4) * 0.5 + hoverY, z)
      relic.rotation.set(
        Math.sin(floatPhase * 0.68) * 0.09,
        side * (0.42 + sideBand * 0.08) + spin,
        Math.cos(floatPhase * 0.74) * 0.07,
      )
    })
  })

  return (
    <>
      {dreamRelics.map(({ index }) => (
        <DreamRelicNode
          key={index}
          index={index}
          nodeRef={(node) => {
            dreamRelicRefs.current[index] = node
          }}
        />
      ))}
    </>
  )
}
