import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { RoundedBox } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { dreamPalette } from "@/game/gameConfig"
import { lerp } from "@/game/number"

interface WheelRef {
  rotation: {
    set: (x: number, y: number, z: number) => void
  }
}

interface SkidMaterialRef {
  opacity: number
}

interface PlayerCarProps {
  carRef: RefObject<Group | null>
  distanceRef: RefObject<number>
  isDriftingRef: RefObject<boolean>
  steeringRef: RefObject<number>
}

interface WheelPlacement {
  position: [number, number, number]
  canSteer: boolean
}

export function PlayerCar({ carRef, distanceRef, isDriftingRef, steeringRef }: PlayerCarProps) {
  const wheelRefs = useRef<Array<WheelRef | null>>([])
  const wheelSteeringRefs = useRef<Array<WheelRef | null>>([])
  const skidMaterialRefs = useRef<Array<SkidMaterialRef | null>>([])
  const wheelPlacements = useMemo(
    (): WheelPlacement[] => [
      { position: [-0.86, -0.28, 1.16], canSteer: false },
      { position: [0.86, -0.28, 1.16], canSteer: false },
      { position: [-0.86, -0.28, -1.12], canSteer: true },
      { position: [0.86, -0.28, -1.12], canSteer: true },
    ],
    [],
  )

  useFrame(() => {
    const wheelRotation = -distanceRef.current * 0.24
    const steeringAngle = -steeringRef.current * 0.26
    const skidOpacity = isDriftingRef.current ? 0.34 : 0

    wheelRefs.current.forEach((wheel) => {
      if (!wheel) return

      wheel.rotation.set(wheelRotation, 0, Math.PI / 2)
    })

    wheelSteeringRefs.current.forEach((wheelSteering) => {
      if (!wheelSteering) return

      wheelSteering.rotation.set(0, steeringAngle, 0)
    })

    skidMaterialRefs.current.forEach((material) => {
      if (!material) return

      material.opacity = lerp(material.opacity, skidOpacity, 0.18)
    })
  })

  return (
    <group ref={carRef}>
      <RoundedBox args={[1.9, 0.54, 3.05]} radius={0.18} smoothness={6} position={[0, 0.18, 0]}>
        <meshStandardMaterial color={dreamPalette.car} roughness={0.28} metalness={0.16} />
      </RoundedBox>

      <RoundedBox
        args={[1.22, 0.52, 1.25]}
        radius={0.18}
        smoothness={6}
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

      {wheelPlacements.map(({ position: [x, y, z], canSteer }, index) => (
        <group key={index} position={[x, y, z]}>
          <group
            ref={(wheelSteering) => {
              wheelSteeringRefs.current[index] = canSteer ? wheelSteering : null
            }}
          >
            <group
              ref={(wheel) => {
                wheelRefs.current[index] = wheel
              }}
            >
              <mesh>
                <cylinderGeometry args={[0.31, 0.31, 0.25, 18]} />
                <meshStandardMaterial color="#6d6070" roughness={0.55} />
              </mesh>
              <mesh position={[0, x > 0 ? -0.14 : 0.14, 0]}>
                <boxGeometry args={[0.18, 0.025, 0.18]} />
                <meshBasicMaterial color={dreamPalette.carGlow} transparent opacity={0.72} />
              </mesh>
            </group>
          </group>
        </group>
      ))}

      {[-0.64, 0.64].map((x, index) => (
        <mesh key={x} position={[x, -0.46, -1.92]} rotation={[-Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.42, 2.4, 0.02]} />
          <meshBasicMaterial
            ref={(material) => {
              skidMaterialRefs.current[index] = material
            }}
            color={dreamPalette.carGlow}
            transparent
            opacity={0}
          />
        </mesh>
      ))}
    </group>
  )
}
