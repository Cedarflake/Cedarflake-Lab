import { Torus } from "@react-three/drei"

import { dreamPalette } from "@/game/gameConfig"
import type { Checkpoint } from "@/shared/types"

interface CheckpointsProps {
  checkpoints: Checkpoint[]
  distance: number
}

export function Checkpoints({ checkpoints, distance }: CheckpointsProps) {
  return (
    <group>
      {checkpoints.map((checkpoint) => {
        const z = -(checkpoint.distance - distance) + 2
        if (z > 20 || z < -260) return null

        return (
          <group key={checkpoint.id} position={[0, 2.8, z]} rotation={[0, 0, Math.PI / 2]}>
            <Torus args={[checkpoint.width / 2, 0.06, 10, 96]}>
              <meshBasicMaterial color={dreamPalette.lemon} transparent opacity={0.88} />
            </Torus>
            <pointLight color={dreamPalette.lemon} intensity={12} distance={9} />
          </group>
        )
      })}
    </group>
  )
}
