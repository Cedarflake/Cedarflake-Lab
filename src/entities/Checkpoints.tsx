import { useRef } from "react"
import type { RefObject } from "react"

import { Torus } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { dreamPalette } from "@/game/gameConfig"
import { resolveRelativeTrackCenter } from "@/game/trackPath"
import type { Checkpoint } from "@/shared/types"

interface CheckpointsProps {
  checkpoints: Checkpoint[]
  distanceRef: RefObject<number>
}

interface CheckpointNodeProps {
  checkpoint: Checkpoint
  nodeRef: (node: Group | null) => void
}

function CheckpointNode({ checkpoint, nodeRef }: CheckpointNodeProps) {
  return (
    <group ref={nodeRef} rotation={[0, 0, Math.PI / 2]}>
      <Torus args={[checkpoint.width / 2, 0.06, 8, 64]}>
        <meshBasicMaterial color={dreamPalette.lemon} transparent opacity={0.88} />
      </Torus>
    </group>
  )
}

export function Checkpoints({ checkpoints, distanceRef }: CheckpointsProps) {
  const checkpointRefs = useRef<Array<Group | null>>([])

  useFrame(() => {
    const distance = distanceRef.current

    checkpoints.forEach((checkpoint, index) => {
      const checkpointGroup = checkpointRefs.current[index]
      if (!checkpointGroup) return

      const z = -(checkpoint.distance - distance) + 2
      const x = resolveRelativeTrackCenter(checkpoint.distance, distance)

      checkpointGroup.position.set(x, 2.8, z)
      checkpointGroup.visible = z <= 20 && z >= -260
    })
  })

  return (
    <group>
      {checkpoints.map((checkpoint, index) => (
        <CheckpointNode
          key={checkpoint.id}
          checkpoint={checkpoint}
          nodeRef={(node) => {
            checkpointRefs.current[index] = node
          }}
        />
      ))}
    </group>
  )
}
