import { BufferGeometry, Float32BufferAttribute } from "three"

import { resolveDesertGroundHeight } from "./desertTerrain"
import { EndlessRoad, roadChunkLength, roadSampleSpacing } from "./trackPath"

export function createRoadRibbon(
  road: EndlessRoad,
  start: number,
  offsets: readonly number[],
  height: number | "terrain",
  isDashed = false,
) {
  const anchor = road.sample(start)
  const positions: number[] = []
  const indices: number[] = []
  const rows = roadChunkLength / roadSampleSpacing
  for (let row = 0; row <= rows; row += 1) {
    const distance = start + row * roadSampleSpacing
    for (const offset of offsets) {
      const point = road.atOffset(distance, offset)
      positions.push(
        point.x - anchor.x,
        height === "terrain" ? resolveDesertGroundHeight(offset, distance) : height,
        point.z - anchor.z,
      )
    }
    if (row === rows || (isDashed && Math.floor(distance / 6) % 2 === 1)) continue
    for (let column = 0; column < offsets.length - 1; column += 1) {
      const a = row * offsets.length + column
      const b = a + offsets.length
      indices.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
