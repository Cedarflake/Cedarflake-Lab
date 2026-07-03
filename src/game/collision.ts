import type { Obstacle } from "@/shared/types"

export const playerCollisionHalfWidth = 0.95
export const wallObstacleWidth = 2.45
export const nearMissPadding = 0.85

export function resolveObstacleHalfWidth(obstacle: Obstacle) {
  if (obstacle.kind === "hole") {
    return obstacle.width * 1.05
  }

  if (obstacle.kind === "wall") {
    return wallObstacleWidth / 2
  }

  return obstacle.width / 2
}

export function resolveObstacleCollisionHalfWidth(obstacle: Obstacle) {
  return resolveObstacleHalfWidth(obstacle) + playerCollisionHalfWidth
}

export function resolveObstacleNearMissHalfWidth(obstacle: Obstacle) {
  return resolveObstacleCollisionHalfWidth(obstacle) + nearMissPadding
}
