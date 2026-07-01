import { RoundedBox } from "@react-three/drei"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import type { BoostGate } from "@/shared/types"

interface BoostGatesProps {
  boostGates: BoostGate[]
  distance: number
}

export function BoostGates({ boostGates, distance }: BoostGatesProps) {
  return (
    <group>
      {boostGates.map((boostGate) => {
        const z = -(boostGate.distance - distance) + 2
        if (z > 18 || z < -260) return null

        const x = boostGate.lane * trackConfig.laneWidth

        return (
          <group key={boostGate.id} position={[x, 0.08, z]}>
            <RoundedBox args={[boostGate.width, 0.08, 2.6]} radius={0.08} smoothness={8}>
              <meshStandardMaterial
                color={dreamPalette.boost}
                emissive={dreamPalette.boost}
                emissiveIntensity={0.46}
                transparent
                opacity={0.88}
              />
            </RoundedBox>
            <mesh position={[0, 0.07, 0]}>
              <boxGeometry args={[0.16, 0.08, 2.9]} />
              <meshBasicMaterial color="#fff7c6" transparent opacity={0.72} />
            </mesh>
            <pointLight color={dreamPalette.boost} intensity={6} distance={5} />
          </group>
        )
      })}
    </group>
  )
}
