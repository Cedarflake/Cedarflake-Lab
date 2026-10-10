import { useEffect, useMemo, useRef } from "react"

import { useFrame } from "@react-three/fiber"
import { Object3D } from "three"
import type { Group, InstancedMesh } from "three"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { createRoadRibbon } from "@/game/roadGeometry"
import { useRoadWorld } from "@/game/roadWorld"
import { roadChunkLength, roadLookAhead, roadLookBehind, roadWindowStart } from "@/game/trackPath"

function RoadChunk({ start }: { start: number }) {
  const world = useRoadWorld()
  const groupRef = useRef<Group>(null)
  const postsRef = useRef<InstancedMesh>(null)
  const railsRef = useRef<InstancedMesh>(null)
  const surfaces = useMemo(() => {
    const half = trackConfig.roadHalfWidth
    return [
      {
        geometry: createRoadRibbon(world.road, start, [-9, 9], -0.09),
        color: "#9b8584",
      },
      { geometry: createRoadRibbon(world.road, start, [-half, half], 0), color: dreamPalette.road },
      ...[-1, 1].map((side) => ({
        geometry: createRoadRibbon(
          world.road,
          start,
          [side * half - 0.2, side * half + 0.2],
          0.025,
        ),
        color: dreamPalette.roadEdge,
      })),
      ...[-1, 0, 1].map((lane) => ({
        geometry: createRoadRibbon(
          world.road,
          start,
          [lane * trackConfig.laneWidth - 0.04, lane * trackConfig.laneWidth + 0.04],
          0.018,
          true,
        ),
        color: "#ebe5d9",
      })),
    ]
  }, [start, world])

  useEffect(() => () => surfaces.forEach(({ geometry }) => geometry.dispose()), [surfaces])
  useEffect(() => {
    const anchor = world.road.sample(start)
    const transform = new Object3D()
    let index = 0
    for (const side of [-1, 1]) {
      for (let station = start; station < start + roadChunkLength; station += 4) {
        const point = world.road.atOffset(station, side * trackConfig.barrierOffset)
        const end = world.road.atOffset(station + 4, side * trackConfig.barrierOffset)
        transform.position.set(point.x - anchor.x, 0.43, point.z - anchor.z)
        transform.rotation.set(0, point.heading, 0)
        transform.scale.set(0.13, 1, 0.2)
        transform.updateMatrix()
        postsRef.current?.setMatrixAt(index, transform.matrix)
        transform.position.set(
          (point.x + end.x) / 2 - anchor.x,
          0.72,
          (point.z + end.z) / 2 - anchor.z,
        )
        transform.rotation.y = Math.atan2(point.x - end.x, point.z - end.z)
        transform.scale.set(
          trackConfig.barrierHalfWidth * 2,
          0.36,
          Math.hypot(end.x - point.x, end.z - point.z) + 0.03,
        )
        transform.updateMatrix()
        railsRef.current?.setMatrixAt(index, transform.matrix)
        index += 1
      }
    }
    for (const mesh of [postsRef.current, railsRef.current]) {
      if (!mesh) continue
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [start, world])
  useFrame(() => {
    const point = world.pose(start)
    groupRef.current?.position.set(point.x, 0, point.z)
  })

  return (
    <group ref={groupRef} name={`road-chunk-${start}`}>
      {surfaces.map(({ geometry, color }, index) => (
        <mesh key={index} receiveShadow>
          <primitive object={geometry} attach="geometry" />
          <meshStandardMaterial
            color={color}
            roughness={0.88}
            polygonOffset={index > 1}
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}
      <instancedMesh
        ref={postsRef}
        args={[undefined, undefined, roadChunkLength / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry />
        <meshStandardMaterial color="#645b60" roughness={0.84} metalness={0.3} />
      </instancedMesh>
      <instancedMesh
        ref={railsRef}
        args={[undefined, undefined, roadChunkLength / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry />
        <meshStandardMaterial color="#b1aaa5" roughness={0.68} metalness={0.4} />
      </instancedMesh>
    </group>
  )
}

export function Track({ distance }: { distance: number }) {
  const start = roadWindowStart(distance)
  const count = (roadLookAhead + roadLookBehind) / roadChunkLength + 1
  return (
    <group name="endless-road">
      {Array.from({ length: count }, (_, index) => (
        <RoadChunk key={start + index * roadChunkLength} start={start + index * roadChunkLength} />
      ))}
    </group>
  )
}
