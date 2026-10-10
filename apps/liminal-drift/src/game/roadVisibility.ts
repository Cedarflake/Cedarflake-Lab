import { environmentFogEnd } from "./environment"
import { roadWindowStart } from "./trackPath"
import type { EndlessRoad, RoadPoint } from "./trackPath"

export function resolveRearRoadVisibility(
  road: EndlessRoad,
  progress: number,
  position: RoadPoint,
) {
  const end = road.sample(roadWindowStart(progress))
  const distanceToEnd = Math.hypot(position.x - end.x, position.z - end.z)
  const backtrack = Math.max(0, progress - position.distance)
  // Close before the cut reaches the camera's fog range, including the chase-camera offset.
  const clearDistance = Math.max(0, distanceToEnd - environmentFogEnd - 40)
  const darkness = backtrack > 0 ? backtrack / (backtrack + clearDistance) : 0
  return {
    darkness,
    hasReachedEnd: backtrack > 0 && distanceToEnd <= environmentFogEnd + 24,
  }
}
