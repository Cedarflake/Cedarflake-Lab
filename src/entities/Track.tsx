import { useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame } from "@react-three/fiber"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { wrapDistance } from "@/game/number"
import { resolveRelativeTrackCenter, resolveTrackHeading } from "@/game/trackPath"

interface TrackSegmentRef {
  position: {
    set: (x: number, y: number, z: number) => void
  }
  rotation: {
    set: (x: number, y: number, z: number) => void
  }
}

interface TrackProps {
  distanceRef: RefObject<number>
}

export function Track({ distanceRef }: TrackProps) {
  const segmentRefs = useRef<Array<TrackSegmentRef | null>>([])
  const segmentIndexes = useMemo(
    () => Array.from({ length: trackConfig.visibleSegments }, (_, index) => index),
    [],
  )

  useFrame(() => {
    const distance = distanceRef.current
    const offset = wrapDistance(distance, trackConfig.segmentLength)
    const firstSegmentDistance = Math.max(0, distance - offset)

    segmentRefs.current.forEach((segment, index) => {
      if (!segment) return

      const segmentDistance = firstSegmentDistance + index * trackConfig.segmentLength
      const z = -(segmentDistance - distance) + 8
      const bend = resolveRelativeTrackCenter(segmentDistance, distance)
      const heading = resolveTrackHeading(segmentDistance)

      segment.position.set(bend, -0.12, z)
      segment.rotation.set(0, heading, 0)
    })
  })

  return (
    <group>
      {segmentIndexes.map((index) => (
        <group
          key={index}
          ref={(segment) => {
            segmentRefs.current[index] = segment
          }}
        >
          <mesh receiveShadow>
            <boxGeometry
              args={[trackConfig.roadHalfWidth * 2, 0.18, trackConfig.segmentLength + 0.36]}
            />
            <meshStandardMaterial color={dreamPalette.road} roughness={0.72} />
          </mesh>

          <mesh position={[-trackConfig.roadHalfWidth - 0.12, 0.03, 0]}>
            <boxGeometry args={[0.16, 0.2, trackConfig.segmentLength - 0.2]} />
            <meshStandardMaterial
              color={dreamPalette.roadEdge}
              emissive={dreamPalette.roadEdge}
              emissiveIntensity={0.25}
            />
          </mesh>
          <mesh position={[trackConfig.roadHalfWidth + 0.12, 0.03, 0]}>
            <boxGeometry args={[0.16, 0.2, trackConfig.segmentLength - 0.2]} />
            <meshStandardMaterial
              color={dreamPalette.roadEdge}
              emissive={dreamPalette.roadEdge}
              emissiveIntensity={0.25}
            />
          </mesh>

          {[-1, 0, 1].map((lane) => (
            <mesh key={lane} position={[lane * trackConfig.laneWidth, 0.04, 0]}>
              <boxGeometry args={[0.08, 0.05, trackConfig.segmentLength * 0.44]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.34} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
