import { useEffect, useMemo, useRef } from "react"

import { useFrame } from "@react-three/fiber"
import { CanvasTexture, LinearFilter, TextureLoader } from "three"
import type { Group } from "three"

import { SkyApparitions } from "@/game/apparitions"
import { useRoadWorld } from "@/game/roadWorld"
import type { RoadWorld } from "@/game/roadWorld"
import { useGameStore } from "@/game/useGameStore"

import { resolveSceneryDistance } from "./dream-objects/shared"

interface FloatingBillboard {
  opacity: number
  scale: [number, number, number]
  x: number
  y: number
  z: number
}

const imageEyeTextureSrc = "/image/eyes-edit.png"
const eyeClouds: FloatingBillboard[] = [
  { x: 30, y: 12.8, z: -38, scale: [13.6, 5.2, 1], opacity: 0.62 },
  { x: -35, y: 11.4, z: -62, scale: [11.4, 4.4, 1], opacity: 0.56 },
  { x: 6, y: 16.2, z: -96, scale: [15.8, 5.8, 1], opacity: 0.46 },
  { x: -6, y: 20.4, z: -142, scale: [18.2, 6.2, 1], opacity: 0.36 },
]

function drawEyeCloudTexture(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d")

  if (!context) {
    return
  }

  const width = canvas.width
  const height = canvas.height
  const centerX = width / 2
  const centerY = height / 2

  context.clearRect(0, 0, width, height)

  const glow = context.createRadialGradient(centerX, centerY, 24, centerX, centerY, 230)
  glow.addColorStop(0, "rgba(238, 215, 210, 0.52)")
  glow.addColorStop(0.48, "rgba(176, 121, 142, 0.36)")
  glow.addColorStop(0.86, "rgba(116, 135, 154, 0.2)")
  glow.addColorStop(1, "rgba(123, 83, 104, 0)")
  context.fillStyle = glow
  context.fillRect(0, 0, width, height)

  const cloudGradient = context.createLinearGradient(56, 72, 456, 194)
  cloudGradient.addColorStop(0, "rgba(212, 192, 181, 0.34)")
  cloudGradient.addColorStop(0.42, "rgba(213, 182, 170, 0.82)")
  cloudGradient.addColorStop(0.72, "rgba(168, 138, 166, 0.6)")
  cloudGradient.addColorStop(1, "rgba(117, 139, 159, 0.3)")

  const lobes = [
    [118, 146, 76, 36, -0.08],
    [186, 122, 92, 48, 0.05],
    [268, 116, 104, 54, -0.04],
    [354, 136, 82, 42, 0.08],
    [248, 158, 168, 45, 0],
  ] as const

  context.fillStyle = cloudGradient
  for (const [x, y, radiusX, radiusY, rotation] of lobes) {
    context.beginPath()
    context.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2)
    context.fill()
  }

  context.beginPath()
  context.ellipse(centerX, 158, 186, 50, 0, 0, Math.PI * 2)
  context.fillStyle = "rgba(72, 54, 70, 0.22)"
  context.fill()

  context.beginPath()
  context.moveTo(84, 150)
  context.bezierCurveTo(152, 210, 348, 214, 432, 148)
  context.strokeStyle = "rgba(229, 202, 198, 0.36)"
  context.lineWidth = 9
  context.stroke()

  context.beginPath()
  context.moveTo(126, 104)
  context.bezierCurveTo(202, 60, 326, 62, 392, 106)
  context.strokeStyle = "rgba(126, 91, 122, 0.46)"
  context.lineWidth = 7
  context.stroke()
}

function createEyeCloudTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 256
  drawEyeCloudTexture(canvas)

  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true

  return texture
}

function updateBillboards(
  billboards: FloatingBillboard[],
  refs: Array<Group | null>,
  elapsed: number,
  world: RoadWorld,
  cameraPosition: { x: number; y: number; z: number },
  phaseOffset: number,
) {
  billboards.forEach((billboard, index) => {
    const group = refs[index]
    if (!group) return

    const phase = elapsed * 0.16 + index * 1.7 + phaseOffset
    const drift = Math.sin(phase) * 0.9
    const pose = world.pose(
      resolveSceneryDistance(-billboard.z, world.distance, 760),
      billboard.x + Math.sin(phase * 0.64) * 1.1,
    )

    group.position.set(pose.x, billboard.y + drift, pose.z)
    group.lookAt(cameraPosition.x, cameraPosition.y, cameraPosition.z)
    group.rotation.z += Math.sin(phase * 0.52) * 0.03
  })
}

export function SkyEyes() {
  const world = useRoadWorld()
  const eyeRefs = useRef<Array<Group | null>>([])
  const cloudRefs = useRef<Array<Group | null>>([])
  const apparitions = useMemo(() => new SkyApparitions(), [])
  const eyeTexture = useMemo(() => {
    const texture = new TextureLoader().load(imageEyeTextureSrc)
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    return texture
  }, [])
  const cloudTexture = useMemo(() => createEyeCloudTexture(), [])

  useEffect(() => {
    return () => {
      eyeTexture.dispose()
      cloudTexture.dispose()
    }
  }, [cloudTexture, eyeTexture])

  useFrame((state) => {
    const elapsed = world.elapsed
    const eyes = apparitions.update(
      elapsed,
      useGameStore.getState().integrity,
      world.vehicleX,
      world.vehicleZ,
    )
    for (const eye of eyes) {
      const group = eyeRefs.current[eye.index]
      if (!group) continue
      group.visible = eye.visible
      if (!eye.visible) continue
      group.position.set(eye.x - world.origin.x, eye.y, eye.z - world.origin.z)
      group.scale.set(eye.size, eye.size * 0.48, 1)
      group.lookAt(state.camera.position)
      group.rotation.z += Math.sin(elapsed * 0.13 + eye.index) * 0.025
    }
    updateBillboards(eyeClouds, cloudRefs.current, elapsed, world, state.camera.position, 2.3)
  })

  return (
    <group>
      {eyeClouds.map((cloud, index) => (
        <group
          key={`cloud-${index}`}
          ref={(node) => {
            cloudRefs.current[index] = node
          }}
          scale={cloud.scale}
        >
          <mesh>
            <planeGeometry args={[1, 0.5]} />
            <meshBasicMaterial
              alphaTest={0.005}
              color="#d7b9c2"
              depthTest={false}
              depthWrite={false}
              fog={false}
              opacity={cloud.opacity}
              transparent
            >
              <primitive attach="map" object={cloudTexture} />
            </meshBasicMaterial>
          </mesh>
        </group>
      ))}

      {apparitions.eyes.map((eye, index) => (
        <group
          key={`eye-${index}`}
          name={`sky-eye-${index}`}
          ref={(node) => {
            eyeRefs.current[index] = node
          }}
          visible={false}
        >
          <mesh>
            <planeGeometry args={[1, 0.58]} />
            <meshBasicMaterial
              alphaTest={0.08}
              color="#ffd7dc"
              depthWrite={false}
              opacity={eye.opacity}
              transparent
            >
              <primitive attach="map" object={eyeTexture} />
            </meshBasicMaterial>
          </mesh>
        </group>
      ))}
    </group>
  )
}
