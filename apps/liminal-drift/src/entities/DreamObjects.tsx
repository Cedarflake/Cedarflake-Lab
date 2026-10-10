import type { RefObject } from "react"

import { DreamRelics } from "@/entities/dream-objects/DreamRelics"
import { ObstacleObjects } from "@/entities/dream-objects/ObstacleObjects"
import { PictureFrames } from "@/entities/dream-objects/PictureFrames"
import { RoadSigns } from "@/entities/dream-objects/RoadSigns"
import { Tombstones } from "@/entities/dream-objects/Tombstones"
import { WorldEnvironment } from "@/entities/WorldEnvironment"
import type { Obstacle } from "@/shared/types"

interface DreamObjectsProps {
  distanceRef: RefObject<number>
  obstacles: Obstacle[]
}

export function DreamObjects({ distanceRef, obstacles }: DreamObjectsProps) {
  return (
    <group>
      <WorldEnvironment />
      <DreamRelics distanceRef={distanceRef} />
      <Tombstones distanceRef={distanceRef} />
      <PictureFrames distanceRef={distanceRef} />
      <RoadSigns distanceRef={distanceRef} />
      <ObstacleObjects obstacles={obstacles} />
    </group>
  )
}
