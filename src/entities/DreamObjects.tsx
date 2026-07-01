import { useMemo } from "react"

import { Float, RoundedBox } from "@react-three/drei"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import type { Obstacle } from "@/shared/types"

interface DreamObjectsProps {
  distance: number
  obstacles: Obstacle[]
}

export function DreamObjects({ distance, obstacles }: DreamObjectsProps) {
  const setPieces = useMemo(
    () => Array.from({ length: 30 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )
  const signs = useMemo(
    () => Array.from({ length: 18 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )

  return (
    <group>
      {setPieces.map(({ index, side }) => {
        const z = -((index * 36 - distance * 0.75) % 1080) - 24
        const x = side * (11 + (index % 4) * 3.2)
        const scale = 0.8 + (index % 5) * 0.16

        return (
          <Float
            key={index}
            speed={0.4 + (index % 3) * 0.12}
            floatIntensity={0.35}
            rotationIntensity={0.08}
          >
            <group position={[x, 0.5, z]} scale={scale}>
              <RoundedBox args={[4.2, 2.1, 0.32]} radius={0.16} smoothness={8}>
                <meshStandardMaterial
                  color={index % 3 === 0 ? dreamPalette.mint : dreamPalette.peach}
                  roughness={0.62}
                />
              </RoundedBox>
              <mesh position={[0, 1.55, -0.08]}>
                <sphereGeometry args={[0.45, 24, 24]} />
                <meshStandardMaterial
                  color={dreamPalette.lemon}
                  emissive={dreamPalette.lemon}
                  emissiveIntensity={0.18}
                />
              </mesh>
            </group>
          </Float>
        )
      })}

      {signs.map(({ index, side }) => {
        const z = -((index * 64 + 28 - distance * 0.9) % 1120) - 42
        const x = side * (trackConfig.roadHalfWidth + 3.8 + (index % 3) * 1.2)
        return (
          <group
            key={index}
            position={[x, 2.25 + (index % 2) * 0.8, z]}
            rotation={[0, side > 0 ? -0.28 : 0.28, 0]}
          >
            <RoundedBox args={[3.4, 1.05, 0.16]} radius={0.08} smoothness={6}>
              <meshStandardMaterial
                color={index % 2 === 0 ? "#fff4bc" : "#d4f4ee"}
                emissive={index % 2 === 0 ? "#f0c76a" : "#8fdad0"}
                emissiveIntensity={0.18}
              />
            </RoundedBox>
            <mesh position={[0, 0.06, 0.1]}>
              <boxGeometry args={[1.9, 0.08, 0.04]} />
              <meshBasicMaterial color="#7f7184" transparent opacity={0.62} />
            </mesh>
            <mesh position={[0, -0.14, 0.1]}>
              <boxGeometry args={[1.15, 0.07, 0.04]} />
              <meshBasicMaterial color="#7f7184" transparent opacity={0.42} />
            </mesh>
          </group>
        )
      })}

      {obstacles.map((obstacle) => {
        const z = -(obstacle.distance - distance) + 2
        if (z > 16 || z < -260) return null

        const x = obstacle.lane * trackConfig.laneWidth

        if (obstacle.kind === "pool") {
          return (
            <mesh key={obstacle.id} position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[obstacle.width * 1.05, 48]} />
              <meshStandardMaterial
                color={dreamPalette.pool}
                emissive={dreamPalette.pool}
                emissiveIntensity={0.16}
                transparent
                opacity={0.84}
              />
            </mesh>
          )
        }

        if (obstacle.kind === "arch") {
          return (
            <group key={obstacle.id} position={[x, 1.2, z]}>
              <mesh position={[-1.25, 0, 0]}>
                <boxGeometry args={[0.34, 2.4, 0.34]} />
                <meshStandardMaterial color={dreamPalette.peach} />
              </mesh>
              <mesh position={[1.25, 0, 0]}>
                <boxGeometry args={[0.34, 2.4, 0.34]} />
                <meshStandardMaterial color={dreamPalette.peach} />
              </mesh>
              <mesh position={[0, 1.15, 0]}>
                <boxGeometry args={[2.84, 0.34, 0.34]} />
                <meshStandardMaterial
                  color={dreamPalette.peach}
                  emissive={dreamPalette.peach}
                  emissiveIntensity={0.12}
                />
              </mesh>
            </group>
          )
        }

        return (
          <RoundedBox
            key={obstacle.id}
            args={[obstacle.width, 1.9, obstacle.width]}
            radius={0.12}
            smoothness={8}
            position={[x, 0.85, z]}
          >
            <meshStandardMaterial color={dreamPalette.mint} roughness={0.48} />
          </RoundedBox>
        )
      })}
    </group>
  )
}
