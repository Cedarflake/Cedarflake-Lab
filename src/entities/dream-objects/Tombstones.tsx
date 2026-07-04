import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { dreamPalette, trackConfig } from "@/game/gameConfig"

import { DuneCross } from "./desertPrimitives"
import { createSideSceneryItems, resolveSceneryZ } from "./shared"

interface TombstonesProps {
  distanceRef: RefObject<number>
}

interface TombstoneNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

const tombstoneCycleDistance = 460

function TombstoneNode({ index, nodeRef }: TombstoneNodeProps) {
  const isTall = index % 3 === 0
  const tint = index % 2 === 0 ? dreamPalette.ruin : dreamPalette.ruinDark

  return (
    <group ref={nodeRef} scale={0.78 + (index % 5) * 0.08}>
      <mesh castShadow receiveShadow position={[0, 0.52, 0]}>
        <boxGeometry args={[0.84, isTall ? 1.18 : 0.94, 0.18]} />
        <meshStandardMaterial color={tint} roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, isTall ? 1.12 : 0.98, 0]}>
        <sphereGeometry args={[0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={tint} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.72, 0.1]}>
        <boxGeometry args={[0.44, 0.06, 0.035]} />
        <meshBasicMaterial color="#3f3942" transparent opacity={0.52} />
      </mesh>
      <mesh position={[0, 0.56, 0.1]}>
        <boxGeometry args={[0.28, 0.05, 0.035]} />
        <meshBasicMaterial color="#3f3942" transparent opacity={0.38} />
      </mesh>
      {index % 4 === 0 && (
        <group position={[0.36, 0.98, 0.12]} rotation={[0, 0, 0.12]}>
          <DuneCross color={dreamPalette.ruinDark} rotation={[0, 0, 0]} scale={0.32} />
        </group>
      )}
    </group>
  )
}

export function Tombstones({ distanceRef }: TombstonesProps) {
  const tombstoneRefs = useRef<Array<Group | null>>([])
  const tombstones = useMemo(() => createSideSceneryItems(22), [])

  useFrame(() => {
    const distance = distanceRef.current

    tombstones.forEach(({ index, side }) => {
      const tombstone = tombstoneRefs.current[index]
      if (!tombstone) return

      const sideBand = index % 4
      const z = resolveSceneryZ(32 + index * 25, distance, 0.94, tombstoneCycleDistance)
      const x = side * (trackConfig.roadHalfWidth + 7.2 + sideBand * 3.4 + (index % 3) * 0.72)
      const groundY = resolveDesertGroundHeight(x, z)
      const lean = Math.sin(index * 1.7) * 0.16

      tombstone.position.set(x, groundY + 0.18, z)
      tombstone.rotation.set(0, side * (0.18 + sideBand * 0.08), lean)
    })
  })

  return (
    <>
      {tombstones.map(({ index }) => (
        <TombstoneNode
          key={index}
          index={index}
          nodeRef={(node) => {
            tombstoneRefs.current[index] = node
          }}
        />
      ))}
    </>
  )
}
