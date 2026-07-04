import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { dreamPalette, trackConfig } from "@/game/gameConfig"

import { createSideSceneryItems, resolveSceneryZ } from "./shared"

interface RoadSignsProps {
  distanceRef: RefObject<number>
}

interface SignNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

const signCycleDistance = 360

function SignNode({ index, nodeRef }: SignNodeProps) {
  const isWarningSign = index % 2 === 0

  return (
    <group ref={nodeRef}>
      <mesh castShadow receiveShadow position={[-0.62, -0.72, -0.04]}>
        <boxGeometry args={[0.1, 1.58, 0.1]} />
        <meshStandardMaterial color={dreamPalette.ruinDark} roughness={0.72} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.62, -0.72, -0.04]}>
        <boxGeometry args={[0.1, 1.32, 0.1]} />
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
  const signRefs = useRef<Array<Group | null>>([])
  const signs = useMemo(() => createSideSceneryItems(10), [])

  useFrame(() => {
    const distance = distanceRef.current

    signs.forEach(({ index, side }) => {
      const sign = signRefs.current[index]
      if (!sign) return

      const z = resolveSceneryZ(18 + index * 44, distance, 1.34, signCycleDistance)
      const x = side * (trackConfig.roadHalfWidth + 3.8 + (index % 3) * 1.2)
      const groundY = resolveDesertGroundHeight(x, z)

      sign.position.set(x, groundY + 1.55 + (index % 2) * 0.48, z)
      sign.rotation.set(0, side > 0 ? -0.34 : 0.34, side * 0.035)
    })
  })

  return (
    <>
      {signs.map(({ index }) => (
        <SignNode
          key={index}
          index={index}
          nodeRef={(node) => {
            signRefs.current[index] = node
          }}
        />
      ))}
    </>
  )
}
