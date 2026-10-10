import { useEffect, useMemo, useRef } from "react"
import type { RefObject } from "react"

import { RoundedBox } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute } from "three"
import type { Group } from "three"

import { dreamPalette } from "@/game/gameConfig"
import { lerp } from "@/game/number"

import { ModelDetails } from "./ModelDetails"

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
  skidIntensityRef: RefObject<number>
  steeringRef: RefObject<number>
}

interface WheelPlacement {
  position: [number, number, number]
  canSteer: boolean
}

const rearWheelZ = 1.16
const frontWheelZ = -1.12
const skidRayY = -0.38
const skidRayNearZ = rearWheelZ + 0.46
const skidRayFarZ = skidRayNearZ + 1.26
const skidRayNearHalfWidth = 0.095
const skidRayFarHalfWidth = 0.018
const cabinGlassColor = "#2f2630"
const bodyMarkColor = "#65151d"
const tailLightColor = "#b82831"
const tailLightGlowColor = "#d53138"
const wheelColor = "#3f3440"

function createSkidRayGeometry() {
  const geometry = new BufferGeometry()

  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        -skidRayNearHalfWidth,
        0,
        skidRayNearZ,
        skidRayNearHalfWidth,
        0,
        skidRayNearZ,
        -skidRayFarHalfWidth,
        0,
        skidRayFarZ,
        skidRayFarHalfWidth,
        0,
        skidRayFarZ,
      ],
      3,
    ),
  )
  geometry.setIndex([0, 2, 1, 1, 2, 3])
  geometry.computeVertexNormals()

  return geometry
}

export function PlayerCar({ carRef, distanceRef, skidIntensityRef, steeringRef }: PlayerCarProps) {
  const wheelRefs = useRef<Array<WheelRef | null>>([])
  const wheelSteeringRefs = useRef<Array<WheelRef | null>>([])
  const skidMaterialRefs = useRef<Array<SkidMaterialRef | null>>([])
  const skidRayGeometry = useMemo(createSkidRayGeometry, [])
  const wheelPlacements = useMemo(
    (): WheelPlacement[] => [
      { position: [-0.86, -0.28, rearWheelZ], canSteer: false },
      { position: [0.86, -0.28, rearWheelZ], canSteer: false },
      { position: [-0.86, -0.28, frontWheelZ], canSteer: true },
      { position: [0.86, -0.28, frontWheelZ], canSteer: true },
    ],
    [],
  )

  useEffect(() => {
    return () => {
      skidRayGeometry.dispose()
    }
  }, [skidRayGeometry])

  useFrame(() => {
    const wheelRotation = -distanceRef.current / 0.31
    const steeringAngle = -steeringRef.current * 0.26
    const skidOpacity = skidIntensityRef.current * 0.46

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
    <group ref={carRef} name="player-car">
      <ModelDetails
        metalness={0.3}
        parts={[
          { position: [0, -0.06, 1.51], size: [1.85, 0.16, 0.19], color: "#756d72" },
          { position: [0, -0.06, -1.51], size: [1.85, 0.16, 0.19], color: "#756d72" },
          { position: [0, 0.18, 1.545], size: [0.35, 0.16, 0.03], color: "#d3c9a9" },
          { position: [0, 0.17, 1.565], size: [0.22, 0.025, 0.01], color: "#50494d" },
          { position: [0, 0.15, -1.535], size: [0.7, 0.2, 0.04], color: "#393039" },
          { position: [0, 0.86, -0.24], size: [1.03, 0.085, 0.93], color: dreamPalette.car },
          { position: [0, 0.43, -0.89], size: [1.35, 0.03, 0.045], color: "#70616b" },
          { position: [0, 0.44, 0.52], size: [1.35, 0.03, 0.035], color: "#70616b" },
          ...[-1, 1].flatMap((side): Parameters<typeof ModelDetails>[0]["parts"] => [
            {
              position: [side * 0.6, 0.66, -0.27],
              size: [0.065, 0.45, 0.07],
              color: dreamPalette.car,
            },
            {
              position: [side * 0.57, 0.64, -0.73],
              size: [0.065, 0.39, 0.08],
              color: "#9f848c",
              rotation: [-0.32, 0, 0],
            },
            {
              position: [side * 0.57, 0.64, 0.29],
              size: [0.065, 0.39, 0.08],
              color: "#9f848c",
              rotation: [0.4, 0, 0],
            },
            { position: [side * 0.966, 0.12, 0.01], size: [0.017, 0.33, 0.018], color: "#705861" },
            { position: [side * 0.966, -0.02, -0.1], size: [0.02, 0.025, 1.45], color: "#594d56" },
            { position: [side * 0.97, 0.28, 0.29], size: [0.025, 0.055, 0.17], color: "#b9b0a5" },
            { position: [side * 0.99, 0.44, -0.63], size: [0.19, 0.14, 0.21], color: "#998189" },
            { position: [side * 0.99, 0.44, -0.51], size: [0.15, 0.09, 0.02], color: "#72868b" },
            { position: [side * 0.62, 0.17, -1.51], size: [0.4, 0.22, 0.05], color: "#efddba" },
            { position: [side * 0.79, 0.17, -1.51], size: [0.06, 0.2, 0.06], color: "#a78468" },
          ]),
          ...[-0.22, 0, 0.22].map((x): Parameters<typeof ModelDetails>[0]["parts"][number] => ({
            position: [x, 0.16, -1.56],
            size: [0.035, 0.16, 0.02],
            color: "#9e9399",
          })),
        ]}
      />
      <RoundedBox
        castShadow
        receiveShadow
        args={[1.9, 0.54, 3.05]}
        radius={0.18}
        smoothness={6}
        position={[0, 0.18, 0]}
      >
        <meshStandardMaterial color={dreamPalette.car} roughness={0.42} metalness={0.08} />
      </RoundedBox>

      <mesh position={[0, 0.49, 0.76]} rotation={[0.02, 0, 0.04]}>
        <boxGeometry args={[1.14, 0.026, 0.22]} />
        <meshBasicMaterial color={bodyMarkColor} transparent opacity={0.44} />
      </mesh>
      <mesh position={[-0.42, 0.48, -0.98]} rotation={[0.01, 0, -0.12]}>
        <boxGeometry args={[0.72, 0.022, 0.16]} />
        <meshBasicMaterial color={bodyMarkColor} transparent opacity={0.32} />
      </mesh>

      <RoundedBox
        castShadow
        receiveShadow
        args={[1.22, 0.52, 1.25]}
        radius={0.18}
        smoothness={6}
        position={[0, 0.62, -0.24]}
      >
        <meshStandardMaterial color={cabinGlassColor} roughness={0.24} transparent opacity={0.62} />
      </RoundedBox>

      <mesh position={[-0.48, 0.22, 1.54]}>
        <boxGeometry args={[0.4, 0.12, 0.08]} />
        <meshBasicMaterial color={tailLightColor} />
      </mesh>
      <mesh position={[0.48, 0.22, 1.54]}>
        <boxGeometry args={[0.4, 0.12, 0.08]} />
        <meshBasicMaterial color={tailLightColor} />
      </mesh>
      <mesh position={[-0.48, 0.22, 1.6]}>
        <boxGeometry args={[0.52, 0.16, 0.03]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={tailLightGlowColor}
          depthWrite={false}
          transparent
          opacity={0.28}
        />
      </mesh>
      <mesh position={[0.48, 0.22, 1.6]}>
        <boxGeometry args={[0.52, 0.16, 0.03]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={tailLightGlowColor}
          depthWrite={false}
          transparent
          opacity={0.28}
        />
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
              <mesh castShadow receiveShadow>
                <cylinderGeometry args={[0.31, 0.31, 0.25, 18]} />
                <meshStandardMaterial color={wheelColor} roughness={0.68} />
              </mesh>
              <mesh position={[0, x > 0 ? -0.14 : 0.14, 0]}>
                <cylinderGeometry args={[0.19, 0.19, 0.03, 12]} />
                <meshStandardMaterial color="#aca5a0" roughness={0.55} metalness={0.4} />
              </mesh>
              <mesh position={[0, x > 0 ? -0.162 : 0.162, 0]}>
                <cylinderGeometry args={[0.067, 0.067, 0.02, 8]} />
                <meshStandardMaterial color="#5d555d" metalness={0.5} roughness={0.6} />
              </mesh>
              {[0, 1, 2, 3, 4].map((spoke) => (
                <mesh
                  key={spoke}
                  position={[
                    Math.cos(spoke * Math.PI * 0.4) * 0.12,
                    x > 0 ? -0.165 : 0.165,
                    Math.sin(spoke * Math.PI * 0.4) * 0.12,
                  ]}
                >
                  <cylinderGeometry args={[0.027, 0.027, 0.015, 6]} />
                  <meshStandardMaterial color="#554e58" roughness={0.8} />
                </mesh>
              ))}
            </group>
          </group>
        </group>
      ))}

      {[-0.86, 0.86].map((x, index) => (
        <mesh key={x} position={[x, skidRayY, 0]} renderOrder={6}>
          <primitive attach="geometry" object={skidRayGeometry} />
          <meshBasicMaterial
            ref={(material) => {
              skidMaterialRefs.current[index] = material
            }}
            color={dreamPalette.carGlow}
            depthTest={false}
            depthWrite={false}
            side={DoubleSide}
            transparent
            opacity={0}
          />
        </mesh>
      ))}
    </group>
  )
}
