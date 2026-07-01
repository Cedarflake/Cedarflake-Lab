import {
  createVisibleBoostGates,
  createVisibleCheckpoints,
  createVisibleObstacles,
} from "../src/game/generation"

const samples = [0, 250, 1200, 4800, 12000]

for (const distance of samples) {
  const obstacles = createVisibleObstacles(distance)
  const boostGates = createVisibleBoostGates(distance)
  const checkpoints = createVisibleCheckpoints(distance)

  if (obstacles.length === 0 || boostGates.length === 0 || checkpoints.length === 0) {
    throw new Error(`Expected visible content at distance ${distance}`)
  }

  const nearestObstacle = obstacles.find((obstacle) => obstacle.distance >= distance)
  const nearestBoostGate = boostGates.find((boostGate) => boostGate.distance >= distance)
  const nearestCheckpoint = checkpoints.find((checkpoint) => checkpoint.distance >= distance)

  if (!nearestObstacle || !nearestBoostGate || !nearestCheckpoint) {
    throw new Error(`Expected forward content at distance ${distance}`)
  }

  console.log("generation ok", {
    distance,
    nearestObstacle: nearestObstacle.id,
    nearestBoostGate: nearestBoostGate.id,
    nearestCheckpoint: nearestCheckpoint.id,
  })
}
