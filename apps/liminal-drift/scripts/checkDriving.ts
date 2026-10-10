import assert from "node:assert/strict"

import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three"

import { crossedRoadGate, sweptVehicleContact } from "../src/game/collision"
import { DrivingSimulation } from "../src/game/drivingSimulation"
import type { DrivingEvent } from "../src/game/drivingSimulation"
import { trackConfig } from "../src/game/gameConfig"
import {
  createEnvironmentTile,
  environmentRadius,
  environmentTileSize,
  WorldEnvironment,
} from "../src/game/environment"
import { createObstacleAt } from "../src/game/generation"
import { clamp } from "../src/game/number"
import { createRoadRibbon } from "../src/game/roadGeometry"
import { createRoadWorld } from "../src/game/roadWorld"
import { resolveRearRoadVisibility } from "../src/game/roadVisibility"
import { createSceneryColliders } from "../src/game/sceneryCollision"
import { createRoadSeed, EndlessRoad, roadChunkLength } from "../src/game/trackPath"
import {
  resolveRoadBarrier,
  resolveSolidMovement,
  sweepSolid,
  vehicleLateralExtent,
  vehicleHalfDepth,
} from "../src/game/solidCollision"
import {
  advancePhysics,
  createVehicle,
  isScoringDrift,
  physicsStep,
  steeringCurvature,
  stepVehicle,
} from "../src/game/vehicle"
import { resolveSceneryDistance } from "../src/entities/dream-objects/shared"
import type { PlayerInput } from "../src/shared/types"

const idle: PlayerInput = { steer: 0, throttle: 0, brake: 0, isDrifting: false }
const gas: PlayerInput = { ...idle, throttle: 1 }
function near(a: number, b: number, tolerance = 1e-6) {
  assert(Math.abs(a - b) < tolerance, `Expected ${a} to be within ${tolerance} of ${b}`)
}

const road = new EndlessRoad()
for (let s = 0; s < 1000; s += 2) {
  const a = road.sample(s)
  const b = road.sample(s + 2)
  near(Math.hypot(b.x - a.x, b.z - a.z), 2, 1e-5)
  assert(Math.abs(b.heading - a.heading) < 0.024, "Curvature must stay drivable")
  const lane = road.atOffset(s, 5)
  const projected = road.project(lane.x, lane.z, s)
  near(projected.offset, 5, 0.002)
}
assert(Math.abs(road.sample(320).x) > 20, "Turns must change world position")
assert(Math.abs(road.sample(320).heading) > 0.3, "Turns must change world heading")
const openingRoutes = new Set<string>()
const laterRoutes = new Set<string>()
const firstTurnDirections = new Set<number>()
const firstTurnStarts = new Set<number>()
for (const seed of Array.from({ length: 32 }, (_, index) => Math.imul(index + 1, 0x9e3779b9))) {
  const seeded = new EndlessRoad(seed)
  const streamed = new EndlessRoad(seed)
  seeded.ensure(6000)
  openingRoutes.add(JSON.stringify([seeded.sample(160), seeded.sample(320)]))
  laterRoutes.add(JSON.stringify(seeded.sample(5000)))
  firstTurnDirections.add(Math.sign(seeded.sample(160).heading))
  let firstTurn = 0
  for (let distance = 0; distance < 6000; distance += 2) {
    const a = seeded.sample(distance)
    const b = seeded.sample(distance + 2)
    if (!firstTurn && Math.abs(b.heading) > 0.00001) firstTurn = distance
    near(Math.hypot(b.x - a.x, b.z - a.z), 2, 1e-5)
    assert(Math.abs(b.heading - a.heading) < 0.024, `Seed ${seed} has an undrivable turn`)
    assert(b.z < a.z, "Random routes must advance without folding back across themselves")
    if (distance % 96 === 0) {
      streamed.retainAround(distance)
      assert.deepEqual(streamed.sample(distance), a, "Streaming must preserve the seeded route")
      assert.deepEqual(
        streamed.sample(distance - 120),
        seeded.sample(distance - 120),
        "Looking back must not regenerate a different route",
      )
    }
  }
  assert(firstTurn >= 48 && firstTurn <= 80, "Each run needs a short, safe opening straight")
  firstTurnStarts.add(firstTurn)
}
assert.equal(openingRoutes.size, 32, "Runs must differ in their opening bends")
assert.equal(laterRoutes.size, 32, "Routes must not converge on a shared late-game template")
assert.equal(firstTurnDirections.size, 2, "The first turn must vary between left and right")
assert(firstTurnStarts.size >= 8, "First bends must not always start at the same station")
const generatedSeeds = new Set(Array.from({ length: 8 }, createRoadSeed))
assert.equal(generatedSeeds.size, 8, "New runs must receive fresh seeds")
for (let s = 0; s < 900; s += roadChunkLength) {
  const a = createRoadRibbon(road, s, [-7.8, 7.8], 0)
  const b = createRoadRibbon(road, s + roadChunkLength, [-7.8, 7.8], 0)
  const pa = a.getAttribute("position")
  const pb = b.getAttribute("position")
  const originA = road.sample(s)
  const originB = road.sample(s + roadChunkLength)
  for (let side = 0; side < 2; side += 1) {
    near(pa.getX(pa.count - 2 + side) + originA.x, pb.getX(side) + originB.x, 0.00002)
    near(pa.getZ(pa.count - 2 + side) + originA.z, pb.getZ(side) + originB.z, 0.00002)
  }
  a.dispose()
  b.dispose()
}

const stopped = createVehicle()
for (let i = 0; i < 120; i += 1) stepVehicle(stopped, { ...idle, steer: 1 }, physicsStep, false)
near(stopped.x, 0)
near(stopped.heading, 0)
function driveFrameRate(fps: number, drift = false) {
  const vehicle = createVehicle()
  let accumulator = 0
  for (let frame = 0; frame < fps * 10; frame += 1) {
    const input = { ...gas, steer: frame / fps >= 4 ? 0.35 : 0, isDrifting: drift }
    accumulator = advancePhysics(accumulator, 1 / fps, () =>
      stepVehicle(vehicle, input, physicsStep, false),
    )
  }
  return vehicle
}
const at30 = driveFrameRate(30)
for (const fps of [60, 120]) {
  const vehicle = driveFrameRate(fps)
  near(vehicle.x, at30.x)
  near(vehicle.z, at30.z)
  near(vehicle.heading, at30.heading)
}
const normal = createVehicle()
const heldDrift = createVehicle()
for (let i = 0; i < 1200; i += 1) {
  stepVehicle(normal, gas, physicsStep, false)
  stepVehicle(heldDrift, { ...gas, isDrifting: true }, physicsStep, false)
}
near(normal.speed, heldDrift.speed)
assert(!isScoringDrift(heldDrift, false), "Holding drift on a straight cannot score")
assert(!isScoringDrift({ ...normal, slipAngle: 0.5 }, true), "Off-road sliding cannot score")

function turnAt(speed: number, brake: number) {
  const car = { ...createVehicle(), speed, velocityZ: -speed }
  for (let i = 0; i < 240; i += 1)
    stepVehicle(car, { ...idle, steer: 0.75, brake }, physicsStep, false)
  return car
}
const fastTurn = turnAt(46, 0)
const brakingTurn = turnAt(46, 0.65)
assert(
  Math.abs(fastTurn.slipAngle) > Math.abs(brakingTurn.slipAngle) + 0.1,
  "Braking must reduce the outward slide",
)
assert(
  brakingTurn.travelled < fastTurn.travelled * 0.7,
  "Braking must shorten the stopping/turning distance",
)

const noSteering = new DrivingSimulation(new EndlessRoad())
let touchedBarrier = false
let barrierDamage = 0
for (let frame = 0; frame < 60 * 14; frame += 1) {
  noSteering.advance(1 / 60, gas, true, (event) => {
    if (event.kind === "damage") barrierDamage += event.amount
    return true
  })
  const extent = vehicleLateralExtent(noSteering.vehicle.heading - noSteering.projection.heading)
  if (Math.abs(noSteering.projection.offset) + extent > 8.1) touchedBarrier = true
  assert(
    Math.abs(noSteering.projection.offset) + extent <
      trackConfig.barrierOffset - trackConfig.barrierHalfWidth + 0.002,
    "The whole car must remain inside the guardrail",
  )
}
assert(touchedBarrier, "A car with no steering must hit the first curve's guardrail")
assert.equal(barrierDamage, 0, "Guardrails must slow the car without any integrity damage")
near(noSteering.vehicle.heading, 0)
assert(
  Math.abs(noSteering.projection.offset) > 5,
  "Guardrails must not center the car or steer it along the route",
)

for (const fps of [30, 60, 120]) {
  const wall = createObstacleAt(1)
  assert.equal(wall.kind, "wall")
  const simulation = new DrivingSimulation(new EndlessRoad())
  const start = simulation.road.atOffset(wall.distance - 9, wall.lane * trackConfig.laneWidth)
  Object.assign(simulation.vehicle, {
    x: start.x,
    z: start.z,
    heading: start.heading,
    velocityX: -Math.sin(start.heading) * 45,
    velocityZ: -Math.cos(start.heading) * 45,
    speed: 45,
  })
  simulation.projection = { ...start, offset: wall.lane * trackConfig.laneWidth }
  simulation.progress = start.distance
  let hits = 0
  for (let frame = 0; frame < fps * 3; frame += 1)
    simulation.advance(1 / fps, gas, false, (event) => {
      if (event.kind === "damage") hits += 1
      return true
    })
  assert(
    simulation.projection.distance < wall.distance - 1.8,
    "Holding the throttle after impact must not pass through a wall",
  )
  assert(simulation.vehicle.speed < 0.4, "A head-on impact must stop the car")
  assert.equal(hits, 1, "Resting contact must not repeatedly damage the car")
  const stoppedAt = simulation.projection.distance
  for (let frame = 0; frame < fps * 2; frame += 1)
    simulation.advance(1 / fps, { ...idle, brake: 1 }, false, () => true)
  assert(
    simulation.projection.distance < stoppedAt - 7,
    "Holding brake after stopping must reverse clear of the wall",
  )
}

const solid = { id: "test-wall", x: 0, z: -10, heading: 0, halfWidth: 5, halfDepth: 0.24 }
const glancing = { ...createVehicle(), x: 2, z: -13, velocityX: 8, velocityZ: -25, speed: 26 }
resolveSolidMovement(glancing, { x: 0, z: 0, heading: 0 }, [solid])
assert(
  glancing.z >= solid.z + solid.halfDepth + vehicleHalfDepth,
  "Swept movement cannot tunnel through a thin wall",
)
assert(
  glancing.x > 1 && glancing.velocityX > 0,
  "A glancing collision must retain tangential motion",
)
for (const heading of [-0.9, 0.4, 1.2]) {
  const target = { ...solid, heading }
  const from = { x: target.x + Math.sin(heading) * 9, z: target.z + Math.cos(heading) * 9, heading }
  const to = { ...from, x: target.x - Math.sin(heading) * 9, z: target.z - Math.cos(heading) * 9 }
  assert(sweepSolid(from, to, target), "Rotated solids must block a fast sweep")
}
for (const station of [160, 250, 400, 520, 700]) {
  const pose = road.atOffset(station, 12)
  const car = {
    ...createVehicle(),
    ...pose,
    heading: pose.heading + 0.8,
    velocityX: 40,
    velocityZ: -20,
  }
  const result = resolveRoadBarrier(car, road, station)
  assert(
    Math.abs(result.projection.offset) +
      vehicleLateralExtent(car.heading - result.projection.heading) <
      trackConfig.barrierOffset - trackConfig.barrierHalfWidth + 0.002,
    "Angled cars must not clip curved guardrails",
  )
}
const railImpact = new DrivingSimulation(new EndlessRoad())
Object.assign(railImpact.vehicle, { x: 6, heading: -Math.PI / 2, velocityX: 35, speed: 35 })
let railDamage = 0
let railFeedback = 0
for (let i = 0; i < 120; i += 1)
  railImpact.advance(1 / 120, gas, true, (event) => {
    if (event.kind === "damage") railDamage += event.amount
    if (event.kind === "impact") railFeedback += 1
    return true
  })
assert(railImpact.vehicle.speed < 0.5, "A head-on guardrail impact must stop forward movement")
assert.equal(railDamage, 0, "A head-on guardrail impact must not damage integrity")
assert.equal(railFeedback, 1, "A guardrail impact must briefly disturb the signal without damage")

const reverse = new DrivingSimulation(new EndlessRoad())
for (let frame = 0; frame < 60 * 4; frame += 1)
  reverse.advance(1 / 60, { ...idle, brake: 1 }, true, () => true)
const earlyDarkness = reverse.reverseDarkness
for (let frame = 0; frame < 60 * 3; frame += 1)
  reverse.advance(1 / 60, { ...idle, brake: 1 }, true, () => true)
assert(
  earlyDarkness > 0.03 && reverse.reverseDarkness > earlyDarkness + 0.04,
  "Darkness must grow with backward distance, including reverse gear",
)
assert(reverse.reverseDarkness <= 1, "Reverse darkness must stay bounded")
for (let frame = 0; frame < 60 * 5; frame += 1) reverse.advance(1 / 60, idle, true, () => true)
const stoppedDarkness = reverse.reverseDarkness
for (let frame = 0; frame < 60 * 4; frame += 1) reverse.advance(1 / 60, idle, true, () => true)
assert.equal(
  reverse.reverseDarkness,
  stoppedDarkness,
  "Waiting must not clear distance-based darkness",
)
for (let frame = 0; frame < 60 * 10 && reverse.reverseDarkness > 0.001; frame += 1)
  reverse.advance(1 / 60, gas, true, () => true)
assert(
  reverse.reverseDarkness < 0.01,
  "Driving away from the rear boundary must open the view again",
)
assert.equal(
  new DrivingSimulation(new EndlessRoad()).reverseDarkness,
  0,
  "A new run must start clear",
)

const backwards = new DrivingSimulation(new EndlessRoad())
backwards.vehicle.heading = Math.PI
let hasLeftStart = false
let fullyDarkFrames = 0
for (let frame = 0; frame < 2400 && !hasLeftStart; frame += 1) {
  backwards.advance(1 / 60, gas, true, (event) => {
    assert(event.kind !== "damage", "The rear boundary must end the run without collision damage")
    hasLeftStart = event.kind === "road-end"
    return !hasLeftStart
  })
  if (!hasLeftStart && backwards.reverseDarkness === 1) fullyDarkFrames += 1
}
assert(hasLeftStart, "A U-turn followed by forward throttle must reach the rear road ending")
assert(fullyDarkFrames > 0, "The center must close fully before the ending event")
assert.equal(backwards.reverseDarkness, 1, "The rear cutoff must be fully obscured at the ending")
assert(
  backwards.projection.distance < -300,
  "The old arbitrary 96 m backtracking limit must be gone",
)
assert.equal(backwards.vehicle.speed, 0, "The vehicle must stop when the road ending is reached")

for (const progress of [0, 430, 2400, 9000]) {
  const visibleRoad = new EndlessRoad()
  visibleRoad.retainAround(progress)
  let lastDarkness = 0
  for (let backtrack = 0; backtrack <= 500; backtrack += 10) {
    const point = visibleRoad.sample(progress - backtrack)
    const visibility = resolveRearRoadVisibility(visibleRoad, progress, point)
    assert(
      visibility.darkness >= lastDarkness,
      "The visible circle must close as the rear end approaches",
    )
    if (visibility.hasReachedEnd) {
      assert.equal(visibility.darkness, 1, "Curved and recycled road endings must close fully")
      break
    }
    lastDarkness = visibility.darkness
  }
}

for (const distance of [180, 360, 540, 720, 900]) {
  const gate = road.sample(distance)
  const from = road.sample(distance - 4)
  const to = road.sample(distance + 4)
  assert(
    crossedRoadGate(from, to, gate, 5.8),
    "Swept gate detection must survive a long frame on curves",
  )
  assert(
    !crossedRoadGate(road.atOffset(distance - 4, 12), road.atOffset(distance + 4, 12), gate, 5.8),
    "Driving past an exit in the sand cannot score",
  )
  assert(
    sweptVehicleContact(from, to, gate, 1, 0.24),
    "A fast car cannot tunnel through a rotated wall",
  )
  assert(
    !sweptVehicleContact(
      road.atOffset(distance - 4, 4),
      road.atOffset(distance + 4, 4),
      gate,
      1,
      0.24,
    ),
    "A clear neighboring lane must not collide",
  )
}

function followRoad(fps: number) {
  const simulation = new DrivingSimulation(new EndlessRoad())
  let checkpoints = 0
  let maxOffset = 0
  const onEvent = (event: DrivingEvent) => {
    if (event.kind === "score" && event.event.feedbackKind === "checkpoint") checkpoints += 1
    return true
  }
  for (let frame = 0; frame < fps * 55; frame += 1) {
    const car = simulation.vehicle
    const ahead = simulation.road.sample(simulation.projection.distance + 18)
    const desiredHeading = Math.atan2(-(ahead.x - car.x), -(ahead.z - car.z))
    const error = Math.atan2(
      Math.sin(desiredHeading - car.heading),
      Math.cos(desiredHeading - car.heading),
    )
    simulation.advance(
      1 / fps,
      {
        steer: clamp((-2 * Math.sin(error)) / (18 * steeringCurvature(car.speed)), -1, 1),
        throttle: car.speed < 27 ? 1 : 0.25,
        brake: car.speed > 30 ? 0.3 : 0,
        isDrifting: false,
      },
      true,
      onEvent,
    )
    maxOffset = Math.max(maxOffset, Math.abs(simulation.projection.offset))
  }
  assert(maxOffset < 3.5, `A controlled drive must stay on the route: ${maxOffset}`)
  assert(
    checkpoints === Math.floor(simulation.progress / trackConfig.checkpointSpacing),
    "All crossed checkpoints must score exactly once",
  )
  return {
    fps,
    distance: Math.round(simulation.progress),
    checkpoints,
    maxOffset: Number(maxOffset.toFixed(2)),
  }
}
const runs = [30, 60, 120].map(followRoad)

const world = createRoadWorld()
const station = resolveSceneryDistance(170, 130, 900)
const before = world.pose(station, 12)
world.origin.x = 128
world.origin.z = -256
world.distance = 190
const after = world.pose(resolveSceneryDistance(170, world.distance, 900), 12)
near(before.x, after.x + world.origin.x)
near(before.z, after.z + world.origin.z)
assert(
  resolveSceneryDistance(170, 811, 900) === 1610,
  "Scenery may recycle only beyond the rear fog distance",
)
const landscape = new WorldEnvironment()
const environmentRoad = new EndlessRoad()
environmentRoad.ensure(1100)
landscape.update(0, 0, environmentRoad)
assert.equal(landscape.tiles.size, (environmentRadius * 2 + 1) ** 2)
for (const sideX of [-1, 1])
  for (const sideZ of [-1, 1]) {
    assert(
      [...landscape.tiles.values()].some((tile) =>
        tile.solids.some((box) => sideX * box.x > 150 && sideZ * box.z > 150),
      ),
      "Each quadrant must have structures away from the road, including behind the start",
    )
  }
assert.deepEqual(
  createEnvironmentTile(3, -2, environmentRoad),
  createEnvironmentTile(3, -2, environmentRoad),
  "Revisiting a world tile must preserve its models and colliders",
)
const sharedTile = landscape.tiles.get("2:2")
landscape.update(environmentTileSize, 0, environmentRoad)
assert.equal(
  landscape.tiles.get("2:2"),
  sharedTile,
  "Existing scenery must not move when the streaming window changes",
)
const building = landscape.solids.find((box) => box.halfWidth > 6 && box.halfDepth > 3)
assert(building)
const testCar = { ...createVehicle(), x: building.x, z: building.z - 20, velocityZ: -50, speed: 50 }
resolveSolidMovement(testCar, { x: building.x, z: building.z + 20, heading: 0 }, [building])
assert(testCar.z > building.z, "A world building must physically block the car")
const arch = new Group()
const postGeometry = new BoxGeometry(0.3, 3, 0.3)
const lintelGeometry = new BoxGeometry(7, 0.3, 0.3)
const testMaterial = new MeshBasicMaterial()
for (const side of [-1, 1]) {
  const post = new Mesh(postGeometry, testMaterial)
  post.position.set(side * 3, 1.5, 0)
  arch.add(post)
}
const lintel = new Mesh(lintelGeometry, testMaterial)
lintel.position.y = 3
arch.add(lintel)
arch.position.set(25, 0, -90)
arch.rotation.y = 0.6
const archSolids = createSceneryColliders([arch], { x: 128, z: -256 }, "arch")
assert.equal(
  archSolids.length,
  2,
  "An overhead lintel must not fill an open passage with collision",
)
for (const box of archSolids) {
  near(box.heading, 0.6)
  near(box.halfWidth, 0.15)
  near(box.halfDepth, 0.15)
}
const passage = { x: 153, z: -346, heading: 0.6 }
assert(
  archSolids.every((box) => !sweepSolid(passage, passage, box)),
  "Rotated model bounds must preserve the central opening",
)
const octagon = {
  id: "column",
  x: 0,
  z: 0,
  heading: 0,
  halfWidth: 3,
  halfDepth: 3,
  outline: Array.from({ length: 8 }, (_, index): [number, number] => [
    Math.sin((index * Math.PI) / 4) * 3,
    Math.cos((index * Math.PI) / 4) * 3,
  ]),
}
const clearCorner = { x: 3.8, z: 4.4, heading: 0 }
assert(
  !sweepSolid(clearCorner, clearCorner, octagon),
  "A round column's empty bounding-box corner must not block the car",
)
postGeometry.dispose()
lintelGeometry.dispose()
testMaterial.dispose()
for (let distance = 0; distance < 100000; distance += 1792) {
  environmentRoad.retainAround(distance)
  environmentRoad.ensure(distance + 1100)
  const point = environmentRoad.sample(distance)
  landscape.update(point.x, point.z, environmentRoad)
  assert.equal(
    landscape.tiles.size,
    225,
    "World streaming storage must stay bounded throughout a long run",
  )
  assert(environmentRoad.sampleCount < 980, "Environment lookahead must not leak road samples")
}
for (let distance = 0; distance < 100000; distance += 48) road.retainAround(distance)
assert(road.sampleCount < 860, `Road storage must stay bounded, got ${road.sampleCount}`)
console.log("world driving ok", {
  guardrailContactAt: Math.round(noSteering.progress),
  fastSlip: fastTurn.slipAngle.toFixed(2),
  brakingSlip: brakingTurn.slipAngle.toFixed(2),
  runs,
  retainedSamples: road.sampleCount,
})
