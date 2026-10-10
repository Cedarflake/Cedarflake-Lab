import type { Obstacle } from "@/shared/types"

import { trackConfig } from "./gameConfig"
import type { VehicleState } from "./vehicle"
import type { RoadPoint } from "./trackPath"

export const playerCollisionHalfWidth = 0.95
export const playerModelHalfDepth = 1.7
export const playerModelHalfWidth = 1.17
export const memoryShardModelHalfDepth = 0.95
export const memoryShardModelHalfWidth = 0.95
export const wallObstacleWidth = trackConfig.wallObstacleWidth
export const nearMissPadding = 0.85

interface FootprintOverlapInput {
  aHalfDepth: number
  aHalfWidth: number
  aX: number
  aZ: number
  bHalfDepth: number
  bHalfWidth: number
  bX: number
  bZ: number
}

export interface MemoryShardCollectionInput {
  playerX: number
  playerZ: number
  shardX: number
  shardZ: number
}

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

export function resolveFootprintOverlap({
  aHalfDepth,
  aHalfWidth,
  aX,
  aZ,
  bHalfDepth,
  bHalfWidth,
  bX,
  bZ,
}: FootprintOverlapInput) {
  return (
    Math.abs(aX - bX) <= aHalfWidth + bHalfWidth && Math.abs(aZ - bZ) <= aHalfDepth + bHalfDepth
  )
}

export function resolveMemoryShardCollection({
  playerX,
  playerZ,
  shardX,
  shardZ,
}: MemoryShardCollectionInput) {
  return resolveFootprintOverlap({
    aHalfDepth: playerModelHalfDepth,
    aHalfWidth: playerModelHalfWidth,
    aX: playerX,
    aZ: playerZ,
    bHalfDepth: memoryShardModelHalfDepth,
    bHalfWidth: memoryShardModelHalfWidth,
    bX: shardX,
    bZ: shardZ,
  })
}

export function hasMemoryShardPassedPlayer(shardZ: number, playerZ = 0) {
  return shardZ > playerZ + playerModelHalfDepth + memoryShardModelHalfDepth
}

export function sweptVehicleContact(
  from: Pick<VehicleState, "x" | "z" | "heading">,
  to: Pick<VehicleState, "x" | "z" | "heading">,
  target: RoadPoint,
  halfWidth: number,
  halfDepth: number,
) {
  let enter = 0
  let leave = 1
  for (const angle of [
    target.heading,
    target.heading + Math.PI / 2,
    to.heading,
    to.heading + Math.PI / 2,
  ]) {
    const ax = Math.cos(angle)
    const az = -Math.sin(angle)
    const extentAt = (heading: number) =>
      playerCollisionHalfWidth * Math.abs(Math.cos(heading - angle)) +
      playerModelHalfDepth * Math.abs(Math.sin(heading - angle))
    const extent =
      Math.max(extentAt(from.heading), extentAt(to.heading)) +
      halfWidth * Math.abs(Math.cos(target.heading - angle)) +
      halfDepth * Math.abs(Math.sin(target.heading - angle))
    const start = (from.x - target.x) * ax + (from.z - target.z) * az
    const movement = (to.x - from.x) * ax + (to.z - from.z) * az
    if (Math.abs(movement) < 1e-9) {
      if (Math.abs(start) > extent) return false
      continue
    }
    const a = (-extent - start) / movement
    const b = (extent - start) / movement
    enter = Math.max(enter, Math.min(a, b))
    leave = Math.min(leave, Math.max(a, b))
    if (enter > leave) return false
  }
  return true
}

export function crossedRoadGate(
  from: { x: number; z: number },
  to: { x: number; z: number },
  gate: RoadPoint,
  halfWidth: number,
) {
  const along = (point: { x: number; z: number }) =>
    -(point.x - gate.x) * Math.sin(gate.heading) - (point.z - gate.z) * Math.cos(gate.heading)
  const before = along(from)
  const after = along(to)
  if (before >= 0 || after < 0) return false
  const fraction = -before / (after - before)
  const x = from.x + (to.x - from.x) * fraction - gate.x
  const z = from.z + (to.z - from.z) * fraction - gate.z
  return Math.abs(x * Math.cos(gate.heading) - z * Math.sin(gate.heading)) <= halfWidth
}
