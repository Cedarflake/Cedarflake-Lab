import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { trackConfig } from "@/game/gameConfig"

import { DuneCluster, RuinCluster } from "./desertPrimitives"
import { createSideSceneryItems, resolveSceneryZ } from "./shared"

interface DesertSceneryProps {
  distanceRef: RefObject<number>
}

interface DesertNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

const desertSetPieceCycleDistance = 420
const desertFieldCycleDistance = 520

function DesertSetPieceNode({ index, nodeRef }: DesertNodeProps) {
  const scale = 0.86 + (index % 5) * 0.14

  return (
    <group ref={nodeRef} scale={scale}>
      <DuneCluster index={index} />
      {index % 2 === 0 && <RuinCluster index={index} />}
    </group>
  )
}

function DesertFieldNode({ index, nodeRef }: DesertNodeProps) {
  const scale = 1.2 + (index % 6) * 0.18
  const hasRuin = index % 4 === 0

  return (
    <group ref={nodeRef} scale={scale}>
      <DuneCluster index={index + 11} />
      {hasRuin && (
        <group position={[0.4, 0.08, -0.2]} scale={0.82}>
          <RuinCluster index={index + 7} />
        </group>
      )}
    </group>
  )
}

export function DesertScenery({ distanceRef }: DesertSceneryProps) {
  const desertSetPieceRefs = useRef<Array<Group | null>>([])
  const desertFieldRefs = useRef<Array<Group | null>>([])
  const desertSetPieces = useMemo(() => createSideSceneryItems(18), [])
  const desertField = useMemo(() => createSideSceneryItems(34), [])

  useFrame(() => {
    const distance = distanceRef.current

    desertSetPieces.forEach(({ index, side }) => {
      const setPiece = desertSetPieceRefs.current[index]
      if (!setPiece) return

      const z = resolveSceneryZ(24 + index * 34, distance, 1.18, desertSetPieceCycleDistance)
      const x = side * (10.4 + (index % 4) * 3.1)
      const groundY = resolveDesertGroundHeight(x, z)
      const floatPhase = distance * 0.025 + index * 0.7

      setPiece.position.set(x, groundY + 0.16, z)
      setPiece.rotation.set(
        Math.sin(floatPhase * 0.7) * 0.006,
        side * 0.12 + Math.sin(floatPhase * 0.5) * 0.025,
        Math.cos(floatPhase * 0.8) * 0.008,
      )
    })

    desertField.forEach(({ index, side }) => {
      const fieldPiece = desertFieldRefs.current[index]
      if (!fieldPiece) return

      const sideBand = index % 3
      const z = resolveSceneryZ(14 + index * 18, distance, 0.82, desertFieldCycleDistance)
      const x = side * (trackConfig.roadHalfWidth + 9.5 + sideBand * 6.2 + (index % 5) * 0.9)
      const groundY = resolveDesertGroundHeight(x, z)
      const floatPhase = distance * 0.016 + index * 0.43

      fieldPiece.position.set(x, groundY + 0.12, z)
      fieldPiece.rotation.set(
        Math.sin(floatPhase * 0.5) * 0.004,
        side * (0.2 + sideBand * 0.08) + Math.sin(floatPhase * 0.7) * 0.018,
        Math.cos(floatPhase * 0.6) * 0.006,
      )
    })
  })

  return (
    <>
      {desertSetPieces.map(({ index }) => (
        <DesertSetPieceNode
          key={index}
          index={index}
          nodeRef={(node) => {
            desertSetPieceRefs.current[index] = node
          }}
        />
      ))}

      {desertField.map(({ index }) => (
        <DesertFieldNode
          key={index}
          index={index}
          nodeRef={(node) => {
            desertFieldRefs.current[index] = node
          }}
        />
      ))}
    </>
  )
}
