import { useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
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
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[0.16, 0.08, 2.9]} />
        <meshBasicMaterial color="#fff7c6" transparent opacity={0.72} />
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
