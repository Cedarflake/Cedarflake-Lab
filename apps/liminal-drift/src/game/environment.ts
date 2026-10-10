import { trackConfig } from "./gameConfig"
import type { SolidBox } from "./solidCollision"
import type { EndlessRoad } from "./trackPath"

export const environmentTileSize = 56
export const environmentRadius = 7
export const environmentFogEnd = 320

export interface EnvironmentPart {
  shape: "box" | "stone" | "dune" | "column"
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
  heading: number
  color: string
}

export interface EnvironmentTile {
  key: string
  parts: EnvironmentPart[]
  solids: SolidBox[]
}

function randomFor(x: number, z: number) {
  let seed = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ 0x6c696d
  return () => {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822519)
    seed = Math.imul(seed ^ (seed >>> 13), 3266489917)
    return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296
  }
}

export function createEnvironmentTile(
  tileX: number,
  tileZ: number,
  road: EndlessRoad,
): EnvironmentTile {
  const random = randomFor(tileX, tileZ)
  const tile: EnvironmentTile = { key: `${tileX}:${tileZ}`, parts: [], solids: [] }
  const add = (part: EnvironmentPart, solid = false) => {
    tile.parts.push(part)
    if (solid) {
      const collider: SolidBox = {
        id: `landscape:${tile.key}:${tile.parts.length}`,
        x: part.x,
        z: part.z,
        heading: part.heading,
        halfWidth: part.width / 2,
        halfDepth: part.depth / 2,
      }
      if (part.shape === "column") {
        collider.outline = Array.from({ length: 8 }, (_, index): [number, number] => [
          (Math.sin((index * Math.PI) / 4) * part.width) / 2,
          (Math.cos((index * Math.PI) / 4) * part.depth) / 2,
        ])
      } else if (part.shape === "stone") {
        collider.outline = [
          [0, 0.514],
          [0.514, 0.196],
          [0.514, -0.196],
          [0, -0.514],
          [-0.514, -0.196],
          [-0.514, 0.196],
        ].map(([px = 0, pz = 0]): [number, number] => [px * part.width, pz * part.depth])
      }
      tile.solids.push(collider)
    }
  }
  for (let index = 0; index < 3; index += 1) {
    const x = (tileX + random()) * environmentTileSize
    const z = (tileZ + random()) * environmentTileSize
    const radius = 10 + random() * 15
    if (road.clearanceAt(x, z) < radius + 18) continue
    const height = 2.5 + random() * 5
    add({
      shape: "dune",
      x,
      z,
      y: -0.15,
      width: radius * 2,
      height,
      depth: radius * 1.6,
      heading: random() * 6,
      color: index % 2 ? "#978777" : "#948676",
    })
  }
  const x = (tileX + 0.2 + random() * 0.6) * environmentTileSize
  const z = (tileZ + 0.2 + random() * 0.6) * environmentTileSize
  if (road.clearanceAt(x, z) < trackConfig.barrierOffset + 16) return tile
  const heading = (Math.floor(random() * 4) * Math.PI) / 2 + (random() - 0.5) * 0.12
  const concrete = ["#827878", "#9d8b88", "#b19e96"][Math.floor(random() * 3)] ?? "#827878"
  const trim = "#c2b5a7"
  const dark = "#403e49"
  const box = (
    px: number,
    y: number,
    pz: number,
    width: number,
    height: number,
    depth: number,
    color: string,
    solid = false,
    shape: EnvironmentPart["shape"] = "box",
  ) => {
    add(
      {
        shape,
        x: x + px * Math.cos(heading) + pz * Math.sin(heading),
        y,
        z: z - px * Math.sin(heading) + pz * Math.cos(heading),
        width,
        height,
        depth,
        heading,
        color,
      },
      solid,
    )
  }
  const kind = random()
  if (kind < 0.26) {
    // A repeated, unoccupied facade reads at both roadside and horizon scales.
    const floors = 2 + Math.floor(random() * 5)
    const height = floors * 3.4
    box(0, height / 2 - 0.14, 0, 13, height, 7, concrete, true)
    box(0, 0.15, 0, 14, 0.6, 8, trim, true)
    box(0, height, 0, 13.8, 0.35, 7.7, trim)
    for (let floor = 0; floor < floors; floor += 1) {
      box(0, floor * 3.4 + 0.55, 0, 13.4, 0.15, 7.4, trim)
      for (const side of [-1, 1]) {
        for (let window = -2; window <= 2; window += 1) {
          const wx = window * 2.5
          const wy = floor * 3.4 + 2
          box(wx, wy, side * 3.53, 1.48, 1.8, 0.1, random() < 0.13 ? "#b9b695" : dark)
          box(wx, wy - 0.97, side * 3.7, 1.8, 0.14, 0.44, trim)
          box(wx, wy, side * 3.61, 0.08, 1.8, 0.08, trim)
          box(wx, wy + 0.16, side * 3.61, 1.5, 0.07, 0.08, trim)
        }
        box(side * 6.55, height / 2, 0, 0.12, height, 0.17, dark)
        for (const wz of [-2, 2]) {
          const wy = floor * 3.4 + 2
          box(side * 6.53, wy, wz, 0.1, 1.8, 1.48, dark)
          box(side * 6.7, wy - 0.97, wz, 0.44, 0.14, 1.8, trim)
          box(side * 6.61, wy, wz, 0.08, 1.8, 0.08, trim)
        }
      }
    }
    box(0, 1.1, 3.59, 1.9, 2.2, 0.16, dark)
    box(0, 2.55, 4.25, 3.3, 0.25, 1.7, trim)
    box(3, height + 1, -1, 2.1, 2, 2.4, concrete)
  } else if (kind < 0.52) {
    // Rooms without roofs, with openings wide enough to remain real openings.
    for (const side of [-1, 1]) {
      box(side * 7, 0.1, 0, 1.5, 0.45, 16, trim, true)
      for (let column = -2; column <= 2; column += 1) {
        const cz = column * 3.5
        const height = column === 2 && side === 1 ? 2.4 : 6.4
        box(side * 7, height / 2, cz, 0.85, height, 0.85, concrete, true, "column")
        box(side * 7, 0.3, cz, 1.25, 0.6, 1.25, trim, true)
        if (height > 3) box(side * 7, height, cz, 1.2, 0.35, 1.2, trim)
      }
      box(side * 7, 6.55, -1.7, 1.05, 0.45, 10.8, concrete)
    }
    box(0, 6.55, -7, 15, 0.45, 1.1, concrete)
    box(0, 0, 0, 16, 0.15, 17, "#857a7b")
  } else if (kind < 0.73) {
    // An empty tiled pool, raised above the sand rather than cut through the ground.
    box(0, 0.1, 0, 18, 0.45, 12, "#85979a", true)
    for (const side of [-1, 1]) {
      box(side * 8.6, 0.65, 0, 0.7, 1.5, 12, trim, true)
      box(0, 0.65, side * 5.6, 17.2, 1.5, 0.7, trim, true)
      box(side * 8.6, 1.44, 0, 1, 0.12, 12.3, "#d1c1b4")
      box(0, 1.44, side * 5.6, 17.2, 0.12, 1, "#d1c1b4")
    }
    for (let stripe = -3; stripe <= 3; stripe += 1)
      box(stripe * 2, 0.34, 0, 0.12, 0.02, 10, "#526b73")
    box(0, 3.4, -8, 0.5, 6.8, 0.5, concrete, true)
    box(0, 6.7, -7, 1.5, 0.18, 3, trim)
    for (let rung = 1; rung < 8; rung += 1) box(0, rung * 0.8, -8.3, 0.8, 0.08, 0.2, dark)
  } else {
    for (let index = 0; index < 5; index += 1) {
      const px = (random() - 0.5) * 24
      const pz = (random() - 0.5) * 24
      const height = 0.7 + random() * 2.2
      box(
        px,
        height / 2 - 0.14,
        pz,
        1.3 + random() * 2,
        height,
        1.1 + random() * 2,
        concrete,
        true,
        "stone",
      )
      if (index % 2 === 0) {
        box(px, height + 0.8, pz, 0.18, 2, 0.2, dark, true)
        box(px, height + 1.4, pz, 0.9, 0.12, 0.2, dark)
      }
    }
  }
  return tile
}

export class WorldEnvironment {
  readonly tiles = new Map<string, EnvironmentTile>()
  revision = 0
  centerX = Infinity
  centerZ = Infinity
  solids: SolidBox[] = []

  update(x: number, z: number, road: EndlessRoad) {
    const centerX = Math.floor(x / environmentTileSize)
    const centerZ = Math.floor(z / environmentTileSize)
    if (centerX === this.centerX && centerZ === this.centerZ) return
    this.centerX = centerX
    this.centerZ = centerZ
    const retained = new Set<string>()
    for (let dx = -environmentRadius; dx <= environmentRadius; dx += 1) {
      for (let dz = -environmentRadius; dz <= environmentRadius; dz += 1) {
        const tx = centerX + dx
        const tz = centerZ + dz
        const key = `${tx}:${tz}`
        retained.add(key)
        if (!this.tiles.has(key)) this.tiles.set(key, createEnvironmentTile(tx, tz, road))
      }
    }
    for (const key of this.tiles.keys()) if (!retained.has(key)) this.tiles.delete(key)
    this.solids = [...this.tiles.values()].flatMap((tile) => tile.solids)
    this.revision += 1
  }
}
