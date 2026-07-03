import { useMemo, useRef } from "react"
import type { RefObject } from "react"

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
  index: number
  nodeRef: (node: Group | null) => void
}

interface SignNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

interface ObstacleNodeProps {
  nodeRef: (node: Group | null) => void
  obstacle: Obstacle
}

const setPieceCycleDistance = 420
const signCycleDistance = 360

function resolveSceneryZ(originDistance: number, distance: number, speed: number, cycle: number) {
  return 10 - wrapDistance(originDistance - distance * speed, cycle)
}

function SetPieceNode({ index, nodeRef }: SetPieceNodeProps) {
  const scale = 0.8 + (index % 5) * 0.16

  return (
    <group ref={nodeRef} scale={scale}>
      <mesh>
        <boxGeometry args={[4.2, 2.1, 0.32]} />
        <meshStandardMaterial
          color={index % 3 === 0 ? dreamPalette.mint : dreamPalette.peach}
          roughness={0.62}
        />
      </mesh>
      <mesh position={[0, 1.55, -0.08]}>
        <sphereGeometry args={[0.45, 12, 12]} />
        <meshStandardMaterial
          color={dreamPalette.lemon}
          emissive={dreamPalette.lemon}
          emissiveIntensity={0.18}
        />
      </mesh>
    </group>
  )
}

function SignNode({ index, nodeRef }: SignNodeProps) {
  return (
    <group ref={nodeRef}>
      <mesh>
        <boxGeometry args={[3.4, 1.05, 0.16]} />
        <meshStandardMaterial
          color={index % 2 === 0 ? "#fff4bc" : "#d4f4ee"}
          emissive={index % 2 === 0 ? "#f0c76a" : "#8fdad0"}
          emissiveIntensity={0.18}
        />
      </mesh>
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

function ObstacleNode({ nodeRef, obstacle }: ObstacleNodeProps) {
  if (obstacle.kind === "hole") {
    return (
      <group ref={nodeRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 1.05, 32]} />
          <meshStandardMaterial
            color={dreamPalette.hole}
            emissive={dreamPalette.holeDepth}
            emissiveIntensity={0.18}
            transparent
            opacity={0.88}
          />
        </mesh>
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 0.72, 28]} />
          <meshBasicMaterial color={dreamPalette.holeDepth} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[obstacle.width * 1.08, 0.035, 8, 40]} />
          <meshBasicMaterial color="#e2ded9" transparent opacity={0.68} />
        </mesh>
      </group>
    )
  }

  if (obstacle.kind === "wall") {
    return (
      <group ref={nodeRef}>
        <mesh position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 0.96, 40]} />
          <meshBasicMaterial color="#fff7c6" transparent opacity={0.36} />
        </mesh>
        <mesh>
          <boxGeometry args={[wallObstacleWidth, 1.45, 0.48]} />
          <meshStandardMaterial
            color={dreamPalette.peach}
            emissive={dreamPalette.peach}
            emissiveIntensity={0.08}
            roughness={0.56}
          />
        </mesh>
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
    <group ref={nodeRef}>
      <mesh>
        <boxGeometry args={[obstacle.width, 1.45, obstacle.width]} />
        <meshStandardMaterial color={dreamPalette.mint} roughness={0.48} />
      </mesh>
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
        <circleGeometry args={[obstacle.width * 0.72, 24]} />
        <meshBasicMaterial color="#fff7c6" transparent opacity={0.36} />
      </mesh>
    </group>
  )
}

export function DreamObjects({ distanceRef, obstacles }: DreamObjectsProps) {
  const obstacleRefs = useRef<Array<Group | null>>([])
  const setPieceRefs = useRef<Array<Group | null>>([])
  const signRefs = useRef<Array<Group | null>>([])
  const setPieces = useMemo(
    () => Array.from({ length: 18 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )
  const signs = useMemo(
    () => Array.from({ length: 10 }, (_, index) => ({ index, side: index % 2 === 0 ? -1 : 1 })),
    [],
  )

  useFrame(() => {
    const distance = distanceRef.current

    setPieces.forEach(({ index, side }) => {
      const setPiece = setPieceRefs.current[index]
      if (!setPiece) return

      const z = resolveSceneryZ(24 + index * 34, distance, 1.18, setPieceCycleDistance)
      const x = side * (11 + (index % 4) * 3.2)
      const floatPhase = distance * 0.025 + index * 0.7

      setPiece.position.set(x, 0.5 + Math.sin(floatPhase) * 0.18, z)
      setPiece.rotation.set(
        Math.sin(floatPhase * 0.7) * 0.018,
        Math.sin(floatPhase * 0.5) * 0.04,
        Math.cos(floatPhase * 0.8) * 0.025,
      )
    })

    signs.forEach(({ index, side }) => {
      const sign = signRefs.current[index]
      if (!sign) return

      const z = resolveSceneryZ(18 + index * 44, distance, 1.34, signCycleDistance)
      const x = side * (trackConfig.roadHalfWidth + 3.8 + (index % 3) * 1.2)

      sign.position.set(x, 2.25 + (index % 2) * 0.8, z)
      sign.rotation.set(0, side > 0 ? -0.28 : 0.28, 0)
    })

    obstacles.forEach((obstacle, index) => {
      const obstacleGroup = obstacleRefs.current[index]
      if (!obstacleGroup) return

      const z = -(obstacle.distance - distance) + 2
      const x =
        resolveRelativeTrackCenter(obstacle.distance, distance) +
        obstacle.lane * trackConfig.laneWidth
      const y = obstacle.kind === "hole" ? 0.01 : obstacle.kind === "wall" ? 0.78 : 0.82

      obstacleGroup.position.set(x, y, z)
      obstacleGroup.visible = z <= 16 && z >= -260
    })
  })

  return (
    <group>
      {setPieces.map(({ index }) => (
        <SetPieceNode
          key={index}
          index={index}
          nodeRef={(node) => {
            setPieceRefs.current[index] = node
          }}
        />
      ))}

      {signs.map(({ index }) => (
        <SignNode
          key={index}
          index={index}
          nodeRef={(node) => {
            signRefs.current[index] = node
          }}
        />
      ))}

      {obstacles.map((obstacle, index) => (
        <ObstacleNode
          key={obstacle.id}
          nodeRef={(node) => {
            obstacleRefs.current[index] = node
          }}
          obstacle={obstacle}
        />
      ))}
    </group>
  )
}
