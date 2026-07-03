import { useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three"
import type { Group } from "three"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { resolveRelativeTrackCenter } from "@/game/trackPath"
import type { BoostGate } from "@/shared/types"

interface BoostGatesProps {
  boostGates: BoostGate[]
  distanceRef: RefObject<number>
}

interface BoostGateNodeProps {
  boostGate: BoostGate
  nodeRef: (node: Group | null) => void
}

const boostArrowHeadGeometry = new BufferGeometry()

boostArrowHeadGeometry.setAttribute(
  "position",
  new Float32BufferAttribute([0, 0, -1.16, -0.72, 0, -0.24, 0.72, 0, -0.24], 3),
)
boostArrowHeadGeometry.setIndex([0, 1, 2])
boostArrowHeadGeometry.computeVertexNormals()

function BoostGateNode({ boostGate, nodeRef }: BoostGateNodeProps) {
  return (
    <group ref={nodeRef}>
      <mesh>
        <boxGeometry args={[boostGate.width, 0.08, 2.6]} />
        <meshStandardMaterial
          color={dreamPalette.boost}
          emissive={dreamPalette.boost}
          emissiveIntensity={0.46}
          transparent
          opacity={0.88}
        />
      </mesh>
      <mesh position={[0, 0.13, 0.24]} renderOrder={2}>
        <boxGeometry args={[0.48, 0.026, 1.24]} />
        <meshBasicMaterial color="#fff7c6" transparent opacity={0.92} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.14, 0]} renderOrder={2}>
        <primitive object={boostArrowHeadGeometry} attach="geometry" />
        <meshBasicMaterial
          color="#fff7c6"
          side={DoubleSide}
          transparent
          opacity={0.92}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export function BoostGates({ boostGates, distanceRef }: BoostGatesProps) {
  const gateRefs = useRef<Array<Group | null>>([])

  useFrame(() => {
    const distance = distanceRef.current

    boostGates.forEach((boostGate, index) => {
      const gate = gateRefs.current[index]
      if (!gate) return

      const z = -(boostGate.distance - distance) + 2
      const x =
        resolveRelativeTrackCenter(boostGate.distance, distance) +
        boostGate.lane * trackConfig.laneWidth

      gate.position.set(x, 0.08, z)
      gate.visible = z <= 18 && z >= -260
    })
  })

  return (
    <group>
      {boostGates.map((boostGate, index) => (
        <BoostGateNode
          key={boostGate.id}
          boostGate={boostGate}
          nodeRef={(node) => {
            gateRefs.current[index] = node
          }}
        />
      ))}
    </group>
  )
}
