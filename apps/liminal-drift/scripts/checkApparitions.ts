import assert from "node:assert/strict"

import { PerspectiveCamera, Vector3 } from "three"

import {
  ApparitionClock,
  calmSkyEyeCount,
  createPictureLayout,
  findPictureAnchor,
  obscuresPicture,
  overlapsPictureSpace,
  PictureApparition,
  resolveApparitionSeverity,
  SkyApparitions,
  skyEyeCount,
} from "../src/game/apparitions"
import { resolveDesertGroundHeight } from "../src/game/desertTerrain"
import { trackConfig } from "../src/game/gameConfig"
import { EndlessRoad } from "../src/game/trackPath"

assert.equal(resolveApparitionSeverity(100), 0)
assert.equal(resolveApparitionSeverity(trackConfig.lowIntegrityThreshold), 0)
assert.equal(resolveApparitionSeverity(0), 1)

const field = new SkyApparitions()
const snapshot = () => field.eyes.filter((eye) => eye.visible).map(({ x, y, z }) => ({ x, y, z }))
field.update(0, 100, 0, 0)
const calm = snapshot()
assert.equal(calm.length, calmSkyEyeCount)
field.update(10, 100, 0, 0)
assert.deepEqual(snapshot(), calm, "Healthy eyes must not jump on a distance-independent timer")
for (const xSign of [-1, 1]) {
  for (const zSign of [-1, 1]) {
    assert(calm.filter(({ x, z }) => x * xSign > 0 && z * zSign > 0).length >= 2)
  }
}
assert(Math.max(...calm.map(({ y }) => y)) - Math.min(...calm.map(({ y }) => y)) > 30)
field.update(10, 16, 0, 0)
assert.equal(snapshot().length, 40)
for (let step = 1; step <= 180; step += 1) field.update(10 + step / 60, 1, 0, 0)
assert.equal(snapshot().length, skyEyeCount - 1)
assert(field.eyes.filter((eye) => eye.visible).every((eye) => eye.size > eye.width * 1.8))
assert(field.eyes.filter((eye) => eye.visible).every((eye) => eye.generation > 0))
const paused = snapshot()
field.update(13, 1, 0, 0)
assert.deepEqual(snapshot(), paused, "A frozen simulation clock must freeze apparition jumps")
field.update(14, 100, 0, 0)
const healed = snapshot()
field.update(15, 100, 3, -4)
assert.deepEqual(snapshot(), healed, "Eyes must remain world anchored while the car moves")
assert.equal(snapshot().length, calmSkyEyeCount)
assert(field.eyes.every((eye) => eye.size === eye.width))

function jumps(integrity: number, fps: number) {
  const clock = new ApparitionClock(2)
  let count = 0
  for (let step = 1; step <= fps * 12; step += 1) {
    if (clock.advance(step / fps, resolveApparitionSeverity(integrity))) count += 1
  }
  return count
}
assert(jumps(1, 60) > jumps(24, 60) * 2)
assert.equal(jumps(1, 30), jumps(1, 120))
assert.equal(jumps(100, 60), 0)

const layout = createPictureLayout()
assert.deepEqual(
  layout,
  createPictureLayout(),
  "Initial picture scatter must be stable across frames",
)
const gaps = layout.slice(1).map((item, index) => item.distance - (layout[index]?.distance ?? 0))
assert(Math.max(...gaps) - Math.min(...gaps) > 25, "Pictures must not use equal roadside spacing")
assert(
  layout.some((item, index) => item.side === layout[index + 1]?.side),
  "Sides must not alternate mechanically",
)
assert(new Set(layout.map(({ offset }) => offset.toFixed(1))).size >= 5)
assert(
  Math.max(...layout.map(({ offset }) => Math.abs(offset))) -
    Math.min(...layout.map(({ offset }) => Math.abs(offset))) >
    15,
  "Pictures must occupy a field, not a narrow shoulder strip",
)
assert(
  layout.every(
    ({ offset, distance }) => Math.abs(offset) > trackConfig.barrierOffset + 2.5 && distance < 800,
  ),
)
assert(field.eyes.every(({ width }) => width >= 7 && width <= 13))

const projected = new Vector3()
let checkedPlacements = 0
for (const seed of [0, 3519791696, 2241883286]) {
  const road = new EndlessRoad(seed)
  for (const distance of [0, 120, 190, 400, 520, 850, 1400, 2500]) {
    for (const direction of [-1, 1]) {
      for (const aspect of [1, 1.6, 2.4]) {
        const center = road.sample(distance)
        const heading = center.heading + (direction < 0 ? Math.PI : 0)
        const camera = new PerspectiveCamera(51, aspect, 0.5, 420)
        camera.position.set(
          center.x + Math.sin(heading) * 11,
          5.4,
          center.z + Math.cos(heading) * 11,
        )
        camera.lookAt(center.x - Math.sin(heading) * 16, 1, center.z - Math.cos(heading) * 16)
        camera.updateMatrixWorld()
        for (let index = 0; index < 7; index += 1) {
          for (let generation = 0; generation < 5; generation += 1) {
            const anchor = findPictureAnchor(
              index,
              generation,
              distance,
              direction,
              (candidate) => {
                const pose = road.atOffset(candidate.distance, candidate.offset)
                projected.set(pose.x, 1.6, pose.z).project(camera)
                return (
                  Math.abs(projected.x) < 0.82 &&
                  Math.abs(projected.y) < 0.75 &&
                  projected.z > -1 &&
                  projected.z < 1
                )
              },
            )
            assert(
              anchor,
              `No visible picture at ${distance}, direction ${direction}, aspect ${aspect}`,
            )
            assert((anchor.distance - distance) * direction >= 24)
            assert((anchor.distance - distance) * direction < 140)
            assert(Math.abs(anchor.offset) >= trackConfig.barrierOffset + 2.5)
            assert(Math.abs(anchor.offset) < 42)
            assert.equal(resolveDesertGroundHeight(anchor.offset, anchor.distance), -0.14)
            checkedPlacements += 1
          }
        }
      }
    }
  }
}

const picture = new PictureApparition(0)
assert.equal(
  picture.update(0, 100, 0, 1, () => true),
  null,
)
const first = picture.update(5, 1, 0, 1, () => true)
assert(first)
assert.deepEqual(
  picture.update(5, 1, 0, 1, () => true),
  first,
)
assert.deepEqual(
  picture.update(6, 100, 0, 1, () => true),
  first,
)
assert.deepEqual(
  picture.update(7, 1, 0, 1, () => false),
  first,
  "Never teleport outside the camera view",
)
const second = picture.update(9, 1, 60, 1, () => true)
assert(second && second.distance >= 84)
assert.notDeepEqual(second, first)
assert.equal(
  picture.update(10, 100, 1000, 1, () => true),
  null,
  "Retire healed frames behind the fog",
)

const blockedPicture = new PictureApparition(0)
const blockedLocations = new Set<number>()
blockedPicture.update(5, 1, 0, 1, (anchor) => {
  blockedLocations.add(anchor.distance)
  return false
})
assert(
  blockedPicture.update(9, 1, 0, 1, (anchor) => !blockedLocations.has(anchor.distance)),
  "A blocked search must try new locations on the next jump",
)

const wall = {
  shape: "box",
  x: 0,
  y: 5,
  z: -20,
  width: 10,
  height: 10,
  depth: 2,
  heading: Math.PI / 6,
  color: "#888",
} as const
assert(obscuresPicture({ x: 0, y: 5, z: 0 }, { x: 0, y: 1.6, z: -40 }, wall))
assert(!obscuresPicture({ x: 0, y: 5, z: 0 }, { x: 30, y: 1.6, z: -40 }, wall))
assert(!obscuresPicture({ x: 0, y: 5, z: 0 }, { x: 0, y: 1.6, z: -10 }, wall))
const footprint = { ...wall, halfWidth: 5, halfDepth: 1 }
assert(overlapsPictureSpace(0, -20, footprint))
assert(!overlapsPictureSpace(15, -20, footprint))

console.log(
  `Apparition checks passed: ${checkedPlacements} visible roadside placements, sky coverage, health, pause and repair`,
)
