import { useMemo } from "react"
import type { RefObject } from "react"

import { RoundedBox, Trail } from "@react-three/drei"
import type { Group } from "three"

import { dreamPalette } from "@/game/gameConfig"

interface PlayerCarProps {
  carRef: RefObject<Group | null>
  steering: number
  isDrifting: boolean
  distance: number
}

export function PlayerCar({ carRef, steering, isDrifting, distance }: PlayerCarProps) {
  const wheelPositions = useMemo(
    (): Array<[number, number, number]> => [
      [-0.86, -0.28, 1.16],
      [0.86, -0.28, 1.16],
      [-0.86, -0.28, -1.12],
      [0.86, -0.28, -1.12],
    ],
    [],
  )

  return (
    <group ref={carRef} rotation={[0, -steering * 0.08, isDrifting ? -steering * 0.08 : 0]}>
      <Trail
        width={1.1}
        length={7}
        color={dreamPalette.carGlow}
        attenuation={(width) => width * width}
      >
        <mesh position={[0, 0.15, 1.35]}>
          <sphereGeometry args={[0.18, 18, 18]} />
          <meshBasicMaterial color={dreamPalette.carGlow} transparent opacity={0.85} />
        </mesh>
      </Trail>

      <RoundedBox args={[1.9, 0.54, 3.05]} radius={0.18} smoothness={8} position={[0, 0.18, 0]}>
        <meshStandardMaterial color={dreamPalette.car} roughness={0.28} metalness={0.16} />
      </RoundedBox>

      <RoundedBox
        args={[1.22, 0.52, 1.25]}
        radius={0.18}
        smoothness={8}
        position={[0, 0.62, -0.24]}
      >
        <meshPhysicalMaterial
          color="#f3f8ff"
          roughness={0.08}
          transmission={0.15}
          thickness={0.35}
          transparent
          opacity={0.68}
        />
      </RoundedBox>

      <mesh position={[-0.48, 0.22, 1.66]}>
        <boxGeometry args={[0.4, 0.12, 0.08]} />
        <meshBasicMaterial color="#fff1b8" />
      </mesh>
      <mesh position={[0.48, 0.22, 1.66]}>
        <boxGeometry args={[0.4, 0.12, 0.08]} />
        <meshBasicMaterial color="#fff1b8" />
      </mesh>

      {wheelPositions.map(([x, y, z], index) => (
        <group key={index} position={[x, y, z]} rotation={[Math.PI / 2, 0, distance * 0.24]}>
          <mesh>
            <cylinderGeometry args={[0.31, 0.31, 0.25, 24]} />
            <meshStandardMaterial color="#6d6070" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.132, 0.2]}>
            <boxGeometry args={[0.08, 0.025, 0.28]} />
            <meshBasicMaterial color={dreamPalette.carGlow} transparent opacity={0.72} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
