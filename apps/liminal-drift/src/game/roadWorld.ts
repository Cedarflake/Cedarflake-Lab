import { createContext, useContext } from "react"

import { WorldEnvironment } from "./environment"
import type { SolidBox } from "./solidCollision"
import { EndlessRoad } from "./trackPath"

export function createRoadWorld(seed = 0) {
  const road = new EndlessRoad(seed)
  road.retainAround(0)
  road.ensure(1100)
  const environment = new WorldEnvironment()
  environment.update(0, 0, road)
  return {
    road,
    environment,
    scenerySolids: new Map<string, SolidBox[]>(),
    vehicleX: 0,
    vehicleZ: 0,
    origin: { x: 0, z: 0 },
    distance: 0,
    elapsed: 0,
    isOffRoad: false,
    pose(distance: number, offset = 0) {
      const point = road.atOffset(distance, offset)
      return { ...point, x: point.x - this.origin.x, z: point.z - this.origin.z }
    },
  }
}

export type RoadWorld = ReturnType<typeof createRoadWorld>
export const RoadWorldContext = createContext<RoadWorld | null>(null)

export function useRoadWorld() {
  const world = useContext(RoadWorldContext)
  if (!world) throw new Error("Road entities must be inside RoadWorldContext")
  return world
}
