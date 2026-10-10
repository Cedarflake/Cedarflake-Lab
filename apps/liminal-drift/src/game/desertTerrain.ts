import { clamp } from "./number"

export const desertTerrain = { baseY: -0.14, halfWidth: 70 } as const

// The drivable shoulder and prop foundations share a level terrace. Distant
// dunes rise outside it; height depends on route coordinates, never camera motion.
export function resolveDesertGroundHeight(offset: number, distance: number) {
  const influence = clamp((Math.abs(offset) - 44) / 26, 0, 1)
  return desertTerrain.baseY + influence * (2.4 + Math.sin(distance * 0.018 + offset * 0.1) * 1.3)
}
