import { useMemo } from "react"
import type { RefObject } from "react"

import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { dreamPalette, sceneryConfig, trackConfig } from "@/game/gameConfig"

import { ModelDetails } from "../ModelDetails"

import { DuneCross } from "./DuneCross"
import { createSideSceneryItems } from "./shared"
import { useWorldScenery } from "./useWorldScenery"

interface TombstonesProps {
  distanceRef: RefObject<number>
}

interface TombstoneNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

const { tombstones } = sceneryConfig

function TombstoneNode({ index, nodeRef }: TombstoneNodeProps) {
  const isTall = index % 3 === 0
  const tint = index % 2 === 0 ? dreamPalette.ruin : dreamPalette.ruinDark

  return (
    <group ref={nodeRef} name={`tombstone-${index}`} scale={0.78 + (index % 5) * 0.08}>
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[1.12, 0.18, 0.54]} />
        <meshStandardMaterial color={tint} roughness={1} />
      </mesh>
      <ModelDetails
        parts={[
          { position: [0, 0.23, 0.105], size: [0.6, 0.065, 0.04], color: "#ada095" },
          { position: [-0.31, 0.62, 0.105], size: [0.045, 0.72, 0.04], color: "#ada095" },
          { position: [0.31, 0.62, 0.105], size: [0.045, 0.72, 0.04], color: "#ada095" },
          {
            position: [0.12, 0.9, 0.11],
            size: [0.018, 0.32, 0.03],
            rotation: [0, 0, -0.36],
            color: "#544d56",
          },
          { position: [0, 0.42, 0.11], size: [0.32, 0.018, 0.025], color: "#6d626b" },
        ]}
      />
      <mesh castShadow receiveShadow position={[0, isTall ? 0.59 : 0.47, 0]}>
        <boxGeometry args={[0.84, isTall ? 1.18 : 0.94, 0.18]} />
        <meshStandardMaterial color={tint} roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, isTall ? 1.12 : 0.98, 0]} scale={[1, 1, 0.24]}>
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
  const tombstoneItems = useMemo(() => createSideSceneryItems(tombstones.count), [])
  const setTombstoneRef = useWorldScenery({
    isSolid: true,
    cycleDistance: tombstones.cycleDistance,
    distanceRef,
    items: tombstoneItems,
    originDistance: ({ index }) => tombstones.originStart + index * tombstones.spacing,
    update: ({ item, node, z }) => {
      const { index, side } = item
      const sideBand = index % tombstones.sideBandCount
      const x =
        side *
        (trackConfig.roadHalfWidth +
          tombstones.baseSideOffset +
          sideBand * tombstones.sideBandOffset +
          (index % tombstones.indexOffsetCount) * tombstones.indexOffset)
      const groundY = resolveDesertGroundHeight(x, -z)
      node.position.set(x, groundY - 0.015, z)
      node.rotation.set(0, side * (tombstones.yawBase + sideBand * tombstones.yawBandOffset), 0)
    },
  })

  return (
    <>
      {tombstoneItems.map(({ index }) => (
        <TombstoneNode
          key={index}
          index={index}
          nodeRef={(node) => {
            setTombstoneRef(index, node)
          }}
        />
      ))}
    </>
  )
}
