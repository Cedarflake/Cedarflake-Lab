import { useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { resolveRelativeTrackCenter } from "@/game/trackPath"
import type { MemoryShard } from "@/shared/types"

interface MemoryShardsProps {
  distanceRef: RefObject<number>
  memoryShards: MemoryShard[]
}

interface MemoryShardNodeProps {
  nodeRef: (node: Group | null) => void
}

function MemoryShardNode({ nodeRef }: MemoryShardNodeProps) {
  return (
    <group ref={nodeRef}>
      <mesh castShadow receiveShadow rotation={[0.62, 0.28, 0.72]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial
          color="#fff0b8"
          emissive={dreamPalette.lemon}
          emissiveIntensity={0.42}
          roughness={0.36}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.018, 8, 36]} />
        <meshBasicMaterial color={dreamPalette.carGlow} transparent opacity={0.46} />
      </mesh>
    </group>
  )
}

export function MemoryShards({ distanceRef, memoryShards }: MemoryShardsProps) {
  const shardRefs = useRef<Array<Group | null>>([])

  useFrame(() => {
    const distance = distanceRef.current

    memoryShards.forEach((memoryShard, index) => {
      const shard = shardRefs.current[index]
      if (!shard) return

      const z = -(memoryShard.distance - distance) + 2
      const x =
        resolveRelativeTrackCenter(memoryShard.distance, distance) +
        memoryShard.lane * trackConfig.laneWidth
      const phase = distance * 0.035 + index * 0.9

      shard.position.set(x, 1.1 + Math.sin(phase) * 0.24, z)
      shard.rotation.set(Math.sin(phase) * 0.08, phase * 0.22, Math.cos(phase) * 0.08)
      shard.visible = z <= 18 && z >= -260
    })
  })

  return (
    <group>
      {memoryShards.map((memoryShard, index) => (
        <MemoryShardNode
          key={memoryShard.id}
          nodeRef={(node) => {
            shardRefs.current[index] = node
          }}
        />
      ))}
    </group>
  )
}
