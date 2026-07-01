import type { Checkpoint, Obstacle } from "@/shared/types"

import { trackConfig } from "./gameConfig"

const obstacleKinds: Array<Obstacle["kind"]> = ["pillar", "pool", "arch"]

function hash(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

export function createObstacles(count = trackConfig.obstacleCount): Obstacle[] {
  return Array.from({ length: count }, (_, index) => {
    const lane = Math.floor(hash(index + 2) * 5) - 2
    const kind = obstacleKinds[Math.floor(hash(index + 9) * obstacleKinds.length)] ?? "pillar"

    return {
      id: `obstacle-${index}`,
      lane,
      distance: 90 + index * 46 + hash(index + 21) * 22,
      width: kind === "arch" ? 2.2 : 1.35 + hash(index + 31) * 0.7,
      kind,
    }
  })
}

export function createCheckpoints(count = 12): Checkpoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `checkpoint-${index}`,
    distance: trackConfig.checkpointSpacing * (index + 1),
    width: 11.6,
  }))
}
