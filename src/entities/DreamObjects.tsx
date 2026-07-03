import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { Float, RoundedBox } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { wallObstacleWidth } from "@/game/collision"
import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { wrapDistance } from "@/game/number"
import { resolveRelativeTrackCenter } from "@/game/trackPath"
import type { Obstacle } from "@/shared/types"

interface DreamObjectsProps {
  distanceRef: RefObject<number>
  obstacles: Obstacle[]
}

interface SetPieceNodeProps {
  distanceRef: RefObject<number>
  index: number
  side: number
}

interface SignNodeProps {
  distanceRef: RefObject<number>
  index: number
  side: number
}

interface ObstacleNodeProps {
  distanceRef: RefObject<number>
  obstacle: Obstacle
}

const setPieceCycleDistance = 420
const signCycleDistance = 360

function resolveSceneryZ(originDistance: number, distance: number, speed: number, cycle: number) {
  return 10 - wrapDistance(originDistance - distance * speed, cycle)
}

function SetPieceNode({ distanceRef, index, side }: SetPieceNodeProps) {
  const setPieceRef = useRef<Group | null>(null)
  const scale = 0.8 + (index % 5) * 0.16

  useFrame(() => {
    const setPiece = setPieceRef.current
    if (!setPiece) return

    const distance = distanceRef.current
    const z = resolveSceneryZ(24 + index * 34, distance, 1.18, setPieceCycleDistance)
    const x = side * (11 + (index % 4) * 3.2)

    setPiece.position.set(x, 0.5, z)
  })

  return (
    <Float speed={0.4 + (index % 3) * 0.12} floatIntensity={0.35} rotationIntensity={0.08}>
      <group ref={setPieceRef} scale={scale}>
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
}

function SignNode({ distanceRef, index, side }: SignNodeProps) {
  const signRef = useRef<Group | null>(null)

  useFrame(() => {
    const sign = signRef.current
    if (!sign) return

    const distance = distanceRef.current
    const z = resolveSceneryZ(18 + index * 44, distance, 1.34, signCycleDistance)
    const x = side * (trackConfig.roadHalfWidth + 3.8 + (index % 3) * 1.2)

    sign.position.set(x, 2.25 + (index % 2) * 0.8, z)
  })

  return (
    <group ref={signRef} rotation={[0, side > 0 ? -0.28 : 0.28, 0]}>
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
}

function ObstacleNode({ distanceRef, obstacle }: ObstacleNodeProps) {
  const obstacleRef = useRef<Group | null>(null)

  useFrame(() => {
    const obstacleGroup = obstacleRef.current
    if (!obstacleGroup) return

    const distance = distanceRef.current
    const z = -(obstacle.distance - distance) + 2
    const x =
      resolveRelativeTrackCenter(obstacle.distance, distance) +
      obstacle.lane * trackConfig.laneWidth

    const y = obstacle.kind === "hole" ? 0.01 : obstacle.kind === "wall" ? 0.78 : 0.82

    obstacleGroup.position.set(x, y, z)
    obstacleGroup.visible = z <= 16 && z >= -260
  })

  if (obstacle.kind === "hole") {
    return (
      <group ref={obstacleRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 1.05, 48]} />
          <meshStandardMaterial
            color={dreamPalette.hole}
            emissive={dreamPalette.holeDepth}
            emissiveIntensity={0.18}
            transparent
            opacity={0.88}
          />
        </mesh>
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 0.72, 40]} />
          <meshBasicMaterial color={dreamPalette.holeDepth} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[obstacle.width * 1.08, 0.035, 8, 64]} />
          <meshBasicMaterial color="#e2ded9" transparent opacity={0.68} />
        </mesh>
      </group>
    )
  }

  if (obstacle.kind === "wall") {
    return (
      <group ref={obstacleRef}>
        <mesh position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 0.96, 40]} />
          <meshBasicMaterial color="#fff7c6" transparent opacity={0.36} />
        </mesh>
        <RoundedBox args={[wallObstacleWidth, 1.45, 0.48]} radius={0.08} smoothness={6}>
          <meshStandardMaterial
            color={dreamPalette.peach}
            emissive={dreamPalette.peach}
            emissiveIntensity={0.08}
            roughness={0.56}
          />
        </RoundedBox>
        <mesh position={[0, 0.18, 0.26]}>
          <boxGeometry args={[1.82, 0.14, 0.05]} />
          <meshBasicMaterial color="#fff7c6" transparent opacity={0.72} />
        </mesh>
        <mesh position={[0, -0.16, 0.27]}>
          <boxGeometry args={[1.16, 0.1, 0.05]} />
          <meshBasicMaterial color={dreamPalette.lemon} transparent opacity={0.46} />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={obstacleRef}>
      <RoundedBox args={[obstacle.width, 1.45, obstacle.width]} radius={0.12} smoothness={8}>
        <meshStandardMaterial color={dreamPalette.mint} roughness={0.48} />
      </RoundedBox>
      <mesh position={[0, 0.86, 0]}>
        <coneGeometry args={[obstacle.width * 0.52, 0.7, 4]} />
        <meshStandardMaterial
          color={dreamPalette.lemon}
          emissive={dreamPalette.lemon}
          emissiveIntensity={0.16}
          roughness={0.44}
        />
      </mesh>
      <mesh position={[0, -0.74, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[obstacle.width * 0.72, 32]} />
        <meshBasicMaterial color="#fff7c6" transparent opacity={0.36} />
      </mesh>
    </group>
  )
}

export function DreamObjects({ distanceRef, obstacles }: DreamObjectsProps) {
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
      {setPieces.map(({ index, side }) => (
        <SetPieceNode key={index} distanceRef={distanceRef} index={index} side={side} />
      ))}

      {signs.map(({ index, side }) => (
        <SignNode key={index} distanceRef={distanceRef} index={index} side={side} />
      ))}

      {obstacles.map((obstacle) => (
        <ObstacleNode key={obstacle.id} distanceRef={distanceRef} obstacle={obstacle} />
      ))}
    </group>
  )
}
