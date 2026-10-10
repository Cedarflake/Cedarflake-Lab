import { useMemo } from "react"
import type { RefObject } from "react"

import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { dreamPalette, sceneryConfig, trackConfig } from "@/game/gameConfig"

import { ModelDetails } from "../ModelDetails"

import { createSideSceneryItems } from "./shared"
import { useWorldScenery } from "./useWorldScenery"

interface RoadSignsProps {
  distanceRef: RefObject<number>
}

interface SignNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

const { roadSigns } = sceneryConfig

function SignNode({ index, nodeRef }: SignNodeProps) {
  const isWarningSign = index % 2 === 0

  return (
    <group ref={nodeRef} name={`road-sign-${index}`}>
      <ModelDetails
        metalness={0.25}
        parts={[
          ...[-1, 1].flatMap((side): Parameters<typeof ModelDetails>[0]["parts"] => [
            { position: [side * 0.62, -1.46, -0.04], size: [0.36, 0.12, 0.34], color: "#82747a" },
            { position: [side * 1.23, 0, 0.09], size: [0.045, 0.73, 0.06], color: "#8e837c" },
            { position: [side * 0.62, 0.22, 0.1], size: [0.05, 0.05, 0.04], color: "#615d64" },
            { position: [side * 0.62, -0.23, 0.1], size: [0.05, 0.05, 0.04], color: "#615d64" },
            { position: [0, side * 0.34, 0.09], size: [2.46, 0.035, 0.06], color: "#8e837c" },
          ]),
          {
            position: [-0.85, 0.1, 0.09],
            size: [0.28, 0.04, 0.026],
            rotation: [0, 0, -0.3],
            color: "#b2a190",
          },
        ]}
      />
      <mesh castShadow receiveShadow position={[-0.62, -0.72, -0.04]}>
        <boxGeometry args={[0.1, 1.58, 0.1]} />
        <meshStandardMaterial color={dreamPalette.ruinDark} roughness={0.72} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.62, -0.72, -0.04]}>
        <boxGeometry args={[0.1, 1.58, 0.1]} />
        <meshStandardMaterial color={dreamPalette.ruinDark} roughness={0.72} />
      </mesh>
      <mesh castShadow receiveShadow rotation={[0, 0, isWarningSign ? 0.04 : -0.04]}>
        <boxGeometry args={[2.62, 0.82, 0.14]} />
        <meshStandardMaterial
          color={isWarningSign ? "#f4dc8c" : "#c9d7cf"}
          emissive={isWarningSign ? "#d59d62" : "#8fbeb7"}
          emissiveIntensity={0.16}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[0.32, 0.06, 0.09]} rotation={[0, 0, isWarningSign ? 0.62 : 0]}>
        <boxGeometry args={isWarningSign ? [0.62, 0.1, 0.04] : [1.38, 0.08, 0.04]} />
        <meshBasicMaterial color="#6d5f62" transparent opacity={0.62} />
      </mesh>
      <mesh position={isWarningSign ? [-0.16, -0.04, 0.1] : [-0.32, -0.16, 0.1]}>
        <boxGeometry args={isWarningSign ? [0.46, 0.1, 0.04] : [0.86, 0.07, 0.04]} />
        <meshBasicMaterial color="#6d5f62" transparent opacity={0.44} />
      </mesh>
    </group>
  )
}

export function RoadSigns({ distanceRef }: RoadSignsProps) {
  const signs = useMemo(() => createSideSceneryItems(roadSigns.count), [])
  const setSignRef = useWorldScenery({
    isSolid: true,
    cycleDistance: roadSigns.cycleDistance,
    distanceRef,
    items: signs,
    originDistance: ({ index }) => roadSigns.originStart + index * roadSigns.spacing,
    update: ({ item, node, z }) => {
      const { index, side } = item
      const x =
        side *
        (trackConfig.roadHalfWidth +
          roadSigns.baseSideOffset +
          (index % roadSigns.sideBandCount) * roadSigns.sideBandOffset)
      const groundY = resolveDesertGroundHeight(x, -z)

      node.position.set(x, groundY + 1.5, z)
      node.rotation.set(0, side > 0 ? -roadSigns.yaw : roadSigns.yaw, 0)
    },
  })

  return (
    <>
      {signs.map(({ index }) => (
        <SignNode
          key={index}
          index={index}
          nodeRef={(node) => {
            setSignRef(index, node)
          }}
        />
      ))}
    </>
  )
}
