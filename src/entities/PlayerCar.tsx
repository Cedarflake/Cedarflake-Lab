import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { RoundedBox, Trail } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { dreamPalette } from "@/game/gameConfig"

interface WheelRef {
  rotation: {
    set: (x: number, y: number, z: number) => void
  }
}

interface PlayerCarProps {
  carRef: RefObject<Group | null>
  distanceRef: RefObject<number>
}

export function PlayerCar({ carRef, distanceRef }: PlayerCarProps) {
  const wheelRefs = useRef<Array<WheelRef | null>>([])
  const wheelPositions = useMemo(
    (): Array<[number, number, number]> => [
      [-0.86, -0.28, 1.16],
      [0.86, -0.28, 1.16],
      [-0.86, -0.28, -1.12],
      [0.86, -0.28, -1.12],
    ],
    [],
  )

  useFrame(() => {
    const wheelRotation = distanceRef.current * 0.24

    wheelRefs.current.forEach((wheel) => {
      if (!wheel) return

      wheel.rotation.set(wheelRotation, 0, Math.PI / 2)
    })
  })

  return (
    <group ref={carRef}>
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
        <group
          key={index}
          position={[x, y, z]}
          ref={(wheel) => {
            wheelRefs.current[index] = wheel
          }}
        >
          <mesh>
            <cylinderGeometry args={[0.31, 0.31, 0.25, 24]} />
            <meshStandardMaterial color="#6d6070" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.2, 0.13]}>
            <boxGeometry args={[0.27, 0.08, 0.025]} />
            <meshBasicMaterial color={dreamPalette.carGlow} transparent opacity={0.72} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
