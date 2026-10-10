import { useCallback, useRef } from "react"
import type { MutableRefObject } from "react"

import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { wallObstacleWidth } from "@/game/collision"
import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { useRoadWorld } from "@/game/roadWorld"
import type { Obstacle } from "@/shared/types"

import { ModelDetails } from "../ModelDetails"

interface ObstacleObjectsProps {
  obstacles: Obstacle[]
}

interface ObstacleNodeProps {
  obstacle: Obstacle
  obstacleRefs: MutableRefObject<Map<string, Group>>
}

function ObstacleNode({ obstacle, obstacleRefs }: ObstacleNodeProps) {
  const nodeRef = useCallback(
    (node: Group | null) => {
      if (node) {
        obstacleRefs.current.set(obstacle.id, node)
        return
      }

      obstacleRefs.current.delete(obstacle.id)
    },
    [obstacle.id, obstacleRefs],
  )

  if (obstacle.kind === "hole") {
    return (
      <group ref={nodeRef} name={obstacle.id}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 1.05, 32]} />
          <meshStandardMaterial
            color={dreamPalette.hole}
            emissive={dreamPalette.holeDepth}
            emissiveIntensity={0.18}
            transparent
            opacity={0.88}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-2}
          />
        </mesh>
        <ModelDetails
          parts={Array.from({ length: 9 }, (_, index) => {
            const angle = (index * Math.PI * 2) / 9
            return {
              position: [Math.sin(angle) * obstacle.width, 0.035, Math.cos(angle) * obstacle.width],
              size: [0.23 + (index % 3) * 0.05, 0.07, 0.12],
              rotation: [0, angle, 0],
              color: index % 2 ? "#807476" : "#bc9f9c",
            }
          })}
        />
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[obstacle.width * 0.72, 28]} />
          <meshBasicMaterial
            color={dreamPalette.holeDepth}
            transparent
            opacity={0.9}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-3}
          />
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
      <group ref={nodeRef} name={obstacle.id}>
        <ModelDetails
          parts={[
            { position: [0, -0.63, 0], size: [wallObstacleWidth, 0.18, 0.48], color: "#83777a" },
            { position: [0, 0.65, 0], size: [wallObstacleWidth, 0.14, 0.48], color: "#c5b7a8" },
            ...[-1, 1].flatMap((side): Parameters<typeof ModelDetails>[0]["parts"] => [
              ...[-0.9, -0.3, 0.3, 0.9].map(
                (x): Parameters<typeof ModelDetails>[0]["parts"][number] => ({
                  position: [x, 0.18, side * 0.249],
                  size: [0.22, 0.43, 0.022],
                  rotation: [0, 0, -0.35],
                  color: "#655c5e",
                }),
              ),
              {
                position: [-1.06, -0.42, side * 0.255],
                size: [0.08, 0.08, 0.024],
                color: "#cfc2ad",
              },
              {
                position: [1.06, -0.42, side * 0.255],
                size: [0.08, 0.08, 0.024],
                color: "#cfc2ad",
              },
              {
                position: [0.7, -0.3, side * 0.245],
                size: [0.025, 0.35, 0.022],
                rotation: [0, 0, 0.4],
                color: "#766b70",
              },
            ]),
          ]}
        />
        <mesh castShadow receiveShadow position={[0, 0.02, 0]}>
          <boxGeometry args={[wallObstacleWidth - 0.1, 1.12, 0.38]} />
          <meshStandardMaterial
            color={dreamPalette.peach}
            emissive={dreamPalette.peach}
            emissiveIntensity={0.08}
            roughness={0.94}
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
    <group ref={nodeRef} name={obstacle.id}>
      <ModelDetails
        parts={[
          {
            position: [0, -0.61, 0],
            size: [obstacle.width, 0.23, obstacle.width],
            color: "#938988",
          },
          { position: [0, 0.6, 0], size: [obstacle.width, 0.18, obstacle.width], color: "#c1b6a5" },
          ...[-1, 1].flatMap((side): Parameters<typeof ModelDetails>[0]["parts"] => [
            {
              position: [side * (obstacle.width / 2 + 0.008), 0, 0],
              size: [0.02, 0.06, obstacle.width],
              color: "#64656b",
            },
            {
              position: [0, -0.32, side * (obstacle.width / 2 + 0.008)],
              size: [obstacle.width, 0.045, 0.02],
              color: "#64656b",
            },
            {
              position: [0.08, 0.13, side * (obstacle.width / 2 + 0.008)],
              size: [0.022, 0.46, 0.02],
              rotation: [0, 0, -0.25],
              color: "#757479",
            },
          ]),
        ]}
      />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[obstacle.width * 0.86, 1.1, obstacle.width * 0.86]} />
        <meshStandardMaterial color={dreamPalette.mint} roughness={0.92} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.86, 0]}>
        <coneGeometry args={[obstacle.width * 0.52, 0.7, 4]} />
        <meshStandardMaterial
          color={dreamPalette.lemon}
          emissive={dreamPalette.lemon}
          emissiveIntensity={0.16}
          roughness={0.44}
        />
      </mesh>
    </group>
  )
}

export function ObstacleObjects({ obstacles }: ObstacleObjectsProps) {
  const world = useRoadWorld()
  const obstacleRefs = useRef<Map<string, Group>>(new Map())

  useFrame(() => {
    obstacles.forEach((obstacle) => {
      const obstacleGroup = obstacleRefs.current.get(obstacle.id)
      if (!obstacleGroup) return

      const pose = world.pose(obstacle.distance, obstacle.lane * trackConfig.laneWidth)
      const y = obstacle.kind === "hole" ? 0.01 : 0.725

      obstacleGroup.position.set(pose.x, y, pose.z)
      obstacleGroup.rotation.set(0, pose.heading, 0)
      obstacleGroup.visible = true
    })
  })

  return (
    <>
      {obstacles.map((obstacle) => (
        <ObstacleNode key={obstacle.id} obstacle={obstacle} obstacleRefs={obstacleRefs} />
      ))}
    </>
  )
}
