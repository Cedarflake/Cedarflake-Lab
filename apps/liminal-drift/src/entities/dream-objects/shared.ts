export type ScenerySide = -1 | 1

export interface SideSceneryItem {
  index: number
  side: ScenerySide
}

export function createSideSceneryItems(length: number) {
  return Array.from({ length }, (_, index): SideSceneryItem => ({
    index,
    side: index % 2 === 0 ? -1 : 1,
  }))
}

export function resolveSceneryDistance(origin: number, distance: number, cycle: number) {
  const span = Math.max(cycle, 1440)
  return origin + Math.ceil((distance - 640 - origin) / span) * span
}
