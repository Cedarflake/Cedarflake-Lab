import { trackConfig } from "./gameConfig"

export interface RunDifficulty {
  maxSpeed: number
}

export function resolveRunDifficulty(): RunDifficulty {
  return {
    maxSpeed: trackConfig.maxSpeed,
  }
}
