import { trackConfig } from "./gameConfig"
import { clamp } from "./number"

export interface RunDifficulty {
  maxSpeed: number
  speedRamp: number
}

export function resolveRunDifficulty(distance: number): RunDifficulty {
  const speedRamp = clamp(distance / trackConfig.speedRampDistance, 0, 1)

  return {
    maxSpeed: trackConfig.maxSpeed + trackConfig.maxSpeedBonus * speedRamp,
    speedRamp,
  }
}
