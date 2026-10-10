import { useEffect, useMemo, useRef } from "react"

import { useFrame } from "@react-three/fiber"
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three"
import type { Group } from "three"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { useRoadWorld } from "@/game/roadWorld"
import type { BoostGate } from "@/shared/types"

import { ModelDetails } from "./ModelDetails"

interface BoostGatesProps {
  boostGates: BoostGate[]
}

interface BoostGateNodeProps {
  arrowHeadGeometry: BufferGeometry
  boostGate: BoostGate
  nodeRef: (node: Group | null) => void
}

function createBoostArrowHeadGeometry() {
  const geometry = new BufferGeometry()

  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([0, 0, -1.16, -0.72, 0, -0.24, 0.72, 0, -0.24], 3),
  )
  geometry.setIndex([0, 1, 2])
  geometry.computeVertexNormals()

  return geometry
}

function BoostGateNode({ arrowHeadGeometry, boostGate, nodeRef }: BoostGateNodeProps) {
  return (
    <group ref={nodeRef}>
      <ModelDetails
        metalness={0.3}
        parts={[-1, 1].flatMap((side): Parameters<typeof ModelDetails>[0]["parts"] => [
          {
            position: [side * (boostGate.width / 2 - 0.08), 0.07, 0],
            size: [0.14, 0.11, 2.6],
            color: "#898590",
          },
          {
            position: [0, 0.06, side * 1.21],
            size: [boostGate.width, 0.08, 0.16],
            color: "#706b78",
          },
          ...[-0.7, 0, 0.7].map((z): Parameters<typeof ModelDetails>[0]["parts"][number] => ({
            position: [side * (boostGate.width / 2 - 0.08), 0.135, z],
            size: [0.06, 0.025, 0.08],
            color: "#cfbfac",
          })),
        ])}
      />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[boostGate.width, 0.08, 2.6]} />
        <meshStandardMaterial
          color={dreamPalette.boost}
          emissive={dreamPalette.boost}
          emissiveIntensity={0.46}
          transparent
          opacity={0.88}
        />
      </mesh>
      <mesh position={[0, 0.13, 0.34]} renderOrder={2}>
        <boxGeometry args={[0.48, 0.026, 1.16]} />
        <meshBasicMaterial color="#fff7c6" transparent opacity={0.92} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.14, 0]} renderOrder={2}>
        <primitive object={arrowHeadGeometry} attach="geometry" />
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

export function BoostGates({ boostGates }: BoostGatesProps) {
  const world = useRoadWorld()
  const gateRefs = useRef<Array<Group | null>>([])
  const arrowHeadGeometry = useMemo(createBoostArrowHeadGeometry, [])

  useEffect(() => {
    return () => {
      arrowHeadGeometry.dispose()
    }
  }, [arrowHeadGeometry])

  useFrame(() => {
    boostGates.forEach((boostGate, index) => {
      const gate = gateRefs.current[index]
      if (!gate) return

      const pose = world.pose(boostGate.distance, boostGate.lane * trackConfig.laneWidth)

      gate.position.set(pose.x, 0.04, pose.z)
      gate.rotation.set(0, pose.heading, 0)
      gate.visible = true
    })
  })

  return (
    <group>
      {boostGates.map((boostGate, index) => (
        <BoostGateNode
          key={boostGate.id}
          arrowHeadGeometry={arrowHeadGeometry}
          boostGate={boostGate}
          nodeRef={(node) => {
            gateRefs.current[index] = node
          }}
        />
      ))}
    </group>
  )
}
