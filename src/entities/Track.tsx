import { useMemo } from "react"

import { dreamPalette, trackConfig } from "@/game/gameConfig"
import { wrapDistance } from "@/game/number"

interface TrackProps {
  distance: number
}

export function Track({ distance }: TrackProps) {
  const segmentIndexes = useMemo(
    () => Array.from({ length: trackConfig.visibleSegments }, (_, index) => index),
    [],
  )
  const offset = wrapDistance(distance, trackConfig.segmentLength)

  return (
    <group>
      {segmentIndexes.map((index) => {
        const z = -index * trackConfig.segmentLength + offset + 8
        const bend = Math.sin((distance * 0.012 + index) * 0.8) * 1.8

        return (
          <group key={index} position={[bend, -0.12, z]}>
            <mesh receiveShadow>
              <boxGeometry
                args={[trackConfig.roadHalfWidth * 2, 0.18, trackConfig.segmentLength - 0.22]}
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
        )
      })}
    </group>
  )
}
