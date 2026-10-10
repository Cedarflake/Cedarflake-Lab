import { useRef } from "react"

import { Torus } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { dreamPalette } from "@/game/gameConfig"
import { useRoadWorld } from "@/game/roadWorld"
import type { Checkpoint } from "@/shared/types"

import { ModelDetails } from "./ModelDetails"

interface CheckpointsProps {
  checkpoints: Checkpoint[]
}

interface CheckpointNodeProps {
  checkpoint: Checkpoint
  nodeRef: (node: Group | null) => void
}

function CheckpointNode({ checkpoint, nodeRef }: CheckpointNodeProps) {
  const ringRadius = checkpoint.width / 2
  const crossY = ringRadius + 0.88

  return (
    <group ref={nodeRef} rotation={[0, 0, Math.PI / 2]}>
      <Torus args={[ringRadius + 0.12, 0.16, 6, 48]} castShadow>
        <meshStandardMaterial color="#8d8286" roughness={0.86} metalness={0.15} />
      </Torus>
      <ModelDetails
        parts={Array.from({ length: 16 }, (_, index) => {
          const angle = (index * Math.PI) / 8
          return {
            position: [
              Math.cos(angle) * (ringRadius + 0.12),
              Math.sin(angle) * (ringRadius + 0.12),
              0.03,
            ],
            size: [0.4, 0.075, 0.42],
            rotation: [0, 0, angle],
            color: index % 4 ? "#aa9c92" : "#c8c1a0",
          }
        })}
      />
      <Torus args={[ringRadius, 0.1, 10, 72]}>
        <meshBasicMaterial color={dreamPalette.lemon} transparent opacity={0.74} />
      </Torus>
      <Torus args={[ringRadius + 0.2, 0.035, 8, 72]}>
        <meshBasicMaterial color="#fff7bc" transparent opacity={0.9} />
      </Torus>
      <group position={[crossY, 0, 0]}>
        <mesh>
          <boxGeometry args={[1.42, 0.18, 0.08]} />
          <meshBasicMaterial color="#fff1a8" transparent opacity={0.92} />
        </mesh>
        <mesh position={[0.22, 0, 0]}>
          <boxGeometry args={[0.18, 1.06, 0.08]} />
          <meshBasicMaterial color="#fff1a8" transparent opacity={0.92} />
        </mesh>
        <mesh position={[-0.54, 0, 0.01]}>
          <boxGeometry args={[0.46, 0.08, 0.06]} />
          <meshBasicMaterial color={dreamPalette.peach} transparent opacity={0.7} />
        </mesh>
      </group>
    </group>
  )
}

export function Checkpoints({ checkpoints }: CheckpointsProps) {
  const world = useRoadWorld()
  const checkpointRefs = useRef<Array<Group | null>>([])

  useFrame(() => {
    checkpoints.forEach((checkpoint, index) => {
      const checkpointGroup = checkpointRefs.current[index]
      if (!checkpointGroup) return

      const pose = world.pose(checkpoint.distance)

      checkpointGroup.position.set(pose.x, 2.8, pose.z)
      checkpointGroup.rotation.set(0, pose.heading, Math.PI / 2)
      checkpointGroup.visible = true
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
