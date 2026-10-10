import { useEffect, useMemo, useRef } from "react"

import { useFrame } from "@react-three/fiber"
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Uint16BufferAttribute } from "three"

import { useRoadWorld } from "@/game/roadWorld"
import type { VehicleState } from "@/game/vehicle"

interface TrailSample {
  x: number
  z: number
  heading: number
  time: number
}
const capacity = 80

export function CarMotionTrail({ vehicle }: { vehicle: VehicleState }) {
  const world = useRoadWorld()
  const samples = useRef<TrailSample[]>([])
  const surfaces = useMemo(
    () =>
      [-0.86, 0.86].map((offset) => {
        const geometry = new BufferGeometry()
        const positions = new Float32BufferAttribute(capacity * 2 * 3, 3)
        const indices = new Uint16BufferAttribute((capacity - 1) * 6, 1)
        geometry.setAttribute("position", positions)
        geometry.setIndex(indices)
        geometry.setDrawRange(0, 0)
        return { geometry, positions, indices, offset }
      }),
    [],
  )
  useEffect(() => () => surfaces.forEach(({ geometry }) => geometry.dispose()), [surfaces])
  useFrame(() => {
    const last = samples.current.at(-1)
    if (
      Math.abs(vehicle.slipAngle) > 0.08 &&
      !world.isOffRoad &&
      vehicle.speed > 9 &&
      (!last || Math.hypot(vehicle.x - last.x, vehicle.z - last.z) > 0.65)
    ) {
      samples.current.push({
        x: vehicle.x,
        z: vehicle.z,
        heading: vehicle.heading,
        time: world.elapsed,
      })
    }
    samples.current = samples.current
      .filter((sample) => world.elapsed - sample.time < 5)
      .slice(-capacity)
    for (const { geometry, positions, indices, offset } of surfaces) {
      let indexCount = 0
      samples.current.forEach((sample, index) => {
        const rearX = sample.x + Math.sin(sample.heading) * 1.16
        const rearZ = sample.z + Math.cos(sample.heading) * 1.16
        for (let edge = 0; edge < 2; edge += 1) {
          const side = offset + (edge === 0 ? -0.095 : 0.095)
          positions.setXYZ(
            index * 2 + edge,
            rearX + Math.cos(sample.heading) * side - world.origin.x,
            0.024,
            rearZ - Math.sin(sample.heading) * side - world.origin.z,
          )
        }
        const previous = samples.current[index - 1]
        if (previous && sample.time - previous.time < 0.2) {
          const a = (index - 1) * 2
          indices.array.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], indexCount)
          indexCount += 6
        }
      })
      geometry.setDrawRange(0, indexCount)
      positions.needsUpdate = true
      indices.needsUpdate = true
    }
  })
  return (
    <group name="tire-trails">
      {surfaces.map(({ geometry, offset }) => (
        <mesh key={offset} frustumCulled={false}>
          <primitive object={geometry} attach="geometry" />
          <meshBasicMaterial
            color="#554553"
            side={DoubleSide}
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}
