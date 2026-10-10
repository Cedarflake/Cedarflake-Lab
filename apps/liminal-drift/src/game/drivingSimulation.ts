import type { PlayerInput } from "@/shared/types"

import {
  crossedRoadGate,
  memoryShardModelHalfDepth,
  memoryShardModelHalfWidth,
  playerCollisionHalfWidth,
  playerModelHalfDepth,
  resolveObstacleHalfWidth,
  sweptVehicleContact,
} from "./collision"
import {
  createVisibleBoostGates,
  createVisibleCheckpoints,
  createVisibleMemoryShards,
  createVisibleObstacles,
} from "./generation"
import { trackConfig } from "./gameConfig"
import { resolveRearRoadVisibility } from "./roadVisibility"
import { resolveCollisionDamage } from "./runState"
import type { ScoreEvent } from "./scoring"
import { resolveRoadBarrier, resolveSolidMovement } from "./solidCollision"
import type { SolidBox } from "./solidCollision"
import { EndlessRoad, roadChunkLength } from "./trackPath"
import {
  advancePhysics,
  createVehicle,
  isScoringDrift,
  physicsStep,
  scaleVehicleSpeed,
  stepVehicle,
} from "./vehicle"

export type DrivingEvent =
  | { kind: "score"; points: number; event: ScoreEvent }
  | { kind: "damage"; amount: number }
  | { kind: "repair"; amount: number }
  | { kind: "charge"; amount: number }
  | { kind: "cash-out" }
  | { kind: "road-end" }
  | { kind: "impact" }

export class DrivingSimulation {
  readonly vehicle = createVehicle()
  readonly road: EndlessRoad
  readonly collectedShards = new Map<string, number>()
  projection = { x: 0, z: 0, heading: 0, distance: 0, curvature: 0, offset: 0 }
  progress = 0
  elapsed = 0
  reverseDarkness = 0
  isOffRoad = false
  private accumulator = 0
  private window = -1
  private handled = new Map<string, number>()
  private lastCollisionAt = -Infinity
  private lastBarrierImpactAt = -Infinity
  private offRoadSeconds = 0
  private wasDrifting = false
  private obstacles = createVisibleObstacles(0)
  private boosts = createVisibleBoostGates(0)
  private shards = createVisibleMemoryShards(0)
  private checkpoints = createVisibleCheckpoints(0)
  private obstacleSolids: SolidBox[] = []
  private scenery: () => readonly SolidBox[]

  constructor(road: EndlessRoad, scenery: () => readonly SolidBox[] = () => []) {
    this.road = road
    this.scenery = scenery
  }

  advance(
    delta: number,
    input: PlayerInput,
    noObstacles: boolean,
    emit: (event: DrivingEvent) => boolean | void,
  ) {
    const scenery = this.scenery().filter(
      (box) =>
        Math.abs(box.x - this.vehicle.x) < box.halfWidth + box.halfDepth + 20 &&
        Math.abs(box.z - this.vehicle.z) < box.halfWidth + box.halfDepth + 20,
    )
    this.accumulator = advancePhysics(this.accumulator, delta, () => {
      const from = { ...this.vehicle }
      this.elapsed += physicsStep
      stepVehicle(this.vehicle, input, physicsStep, this.isOffRoad)
      const solids = noObstacles ? scenery : [...this.obstacleSolids, ...scenery]
      const contact = resolveSolidMovement(this.vehicle, from, solids)
      const barrier = resolveRoadBarrier(this.vehicle, this.road, this.projection.distance)
      this.projection = barrier.projection
      if (barrier.impact > 3 && this.elapsed - this.lastBarrierImpactAt >= 0.6) {
        this.lastBarrierImpactAt = this.elapsed
        if (emit({ kind: "impact" }) === false) return false
      }
      const impact = contact.impact
      if (contact.id) this.handled.set(contact.id, this.projection.distance)
      if (
        impact > 3 &&
        this.elapsed - this.lastCollisionAt >= trackConfig.collisionRecoverySeconds
      ) {
        this.lastCollisionAt = this.elapsed
        const amount = resolveCollisionDamage({
          baseDamage: trackConfig.collisionDamage,
          speed: impact,
          speedReference: trackConfig.maxSpeed,
          minSpeedDamageMultiplier: trackConfig.collisionMinSpeedDamageMultiplier,
          maxSpeedDamageMultiplier: trackConfig.collisionMaxSpeedDamageMultiplier,
          isDrifting: Math.abs(this.vehicle.slipAngle) > 0.1,
          driftDamageMultiplier: trackConfig.driftCollisionDamageMultiplier,
        })
        if (emit({ kind: "damage", amount }) === false) return false
      }
      this.progress = Math.max(this.progress, this.projection.distance)
      const rearRoad = resolveRearRoadVisibility(this.road, this.progress, this.projection)
      this.reverseDarkness = rearRoad.darkness
      if (rearRoad.hasReachedEnd) {
        scaleVehicleSpeed(this.vehicle, 0)
        emit({ kind: "road-end" })
        return false
      }
      const distanceFromRoad = Math.hypot(
        this.vehicle.x - this.projection.x,
        this.vehicle.z - this.projection.z,
      )
      this.isOffRoad = distanceFromRoad > trackConfig.roadHalfWidth - 0.45
      const nextWindow = Math.floor(this.progress / roadChunkLength)
      if (nextWindow !== this.window) {
        this.window = nextWindow
        this.road.retainAround(this.progress)
        this.obstacles = createVisibleObstacles(this.progress, 120)
        this.obstacleSolids = this.obstacles
          .filter((obstacle) => obstacle.kind !== "hole")
          .map((obstacle) => ({
            id: obstacle.id,
            ...this.road.atOffset(obstacle.distance, obstacle.lane * trackConfig.laneWidth),
            halfWidth: resolveObstacleHalfWidth(obstacle),
            halfDepth: obstacle.kind === "wall" ? 0.24 : resolveObstacleHalfWidth(obstacle),
          }))
        this.boosts = createVisibleBoostGates(this.progress, 120)
        this.shards = createVisibleMemoryShards(this.progress, 120)
        this.checkpoints = createVisibleCheckpoints(this.progress, 120)
        for (const [id, distance] of this.handled) {
          if (distance < this.progress - 160) {
            this.handled.delete(id)
            this.collectedShards.delete(id)
          }
        }
      }

      if (distanceFromRoad > 42) {
        emit({ kind: "damage", amount: 100 })
        return false
      }
      this.offRoadSeconds = this.isOffRoad ? this.offRoadSeconds + physicsStep : 0
      if (this.offRoadSeconds > 2.5 && this.elapsed - this.lastCollisionAt > 1.5) {
        this.lastCollisionAt = this.elapsed
        if (emit({ kind: "damage", amount: 8 }) === false) return false
      }

      if (!noObstacles) {
        for (const obstacle of this.obstacles) {
          if (this.handled.has(obstacle.id)) continue
          const pose = this.road.atOffset(obstacle.distance, obstacle.lane * trackConfig.laneWidth)
          const halfDepth = obstacle.kind === "wall" ? 0.24 : resolveObstacleHalfWidth(obstacle)
          if (
            obstacle.kind === "hole" &&
            sweptVehicleContact(
              from,
              this.vehicle,
              pose,
              resolveObstacleHalfWidth(obstacle),
              halfDepth,
            )
          ) {
            this.handled.set(obstacle.id, obstacle.distance)
            if (this.elapsed - this.lastCollisionAt < trackConfig.collisionRecoverySeconds) continue
            this.lastCollisionAt = this.elapsed
            const amount = resolveCollisionDamage({
              baseDamage: trackConfig.collisionDamage,
              speed: this.vehicle.speed,
              speedReference: trackConfig.maxSpeed,
              minSpeedDamageMultiplier: trackConfig.collisionMinSpeedDamageMultiplier,
              maxSpeedDamageMultiplier: trackConfig.collisionMaxSpeedDamageMultiplier,
              isDrifting: Math.abs(this.vehicle.slipAngle) > 0.1,
              driftDamageMultiplier: trackConfig.driftCollisionDamageMultiplier,
            })
            scaleVehicleSpeed(this.vehicle, 0.55)
            if (emit({ kind: "damage", amount }) === false) return false
          } else if (this.projection.distance > obstacle.distance + halfDepth + 2) {
            this.handled.set(obstacle.id, obstacle.distance)
            if (this.isOffRoad) continue
            const offset = Math.abs(this.projection.offset - obstacle.lane * trackConfig.laneWidth)
            const isNearMiss = offset < resolveObstacleHalfWidth(obstacle) + 2
            emit({
              kind: "score",
              points: isNearMiss ? trackConfig.nearMissScore : trackConfig.passScore,
              event: isNearMiss
                ? { label: "Something missed you", feedbackKind: "near-miss" }
                : { label: "No contact recorded" },
            })
          }
        }
      }

      for (const gate of this.boosts) {
        if (this.handled.has(gate.id)) continue
        const pose = this.road.atOffset(gate.distance, gate.lane * trackConfig.laneWidth)
        const relativeHeading = this.vehicle.heading - pose.heading
        const carHalfWidth =
          Math.abs(Math.cos(relativeHeading)) * playerCollisionHalfWidth +
          Math.abs(Math.sin(relativeHeading)) * playerModelHalfDepth
        if (crossedRoadGate(from, this.vehicle, pose, gate.width / 2 + carHalfWidth)) {
          this.handled.set(gate.id, gate.distance)
          if (this.vehicle.speed > 0.1)
            scaleVehicleSpeed(
              this.vehicle,
              Math.min(
                this.vehicle.speed + trackConfig.boostSpeed,
                trackConfig.maxSpeed + trackConfig.boostSpeed,
              ) / this.vehicle.speed,
            )
          emit({
            kind: "score",
            points: trackConfig.boostScore,
            event: { label: "Signal returned wrong", feedbackKind: "boost" },
          })
        }
      }
      for (const shard of this.shards) {
        if (this.handled.has(shard.id)) continue
        const pose = this.road.atOffset(shard.distance, shard.lane * trackConfig.laneWidth)
        if (
          sweptVehicleContact(
            from,
            this.vehicle,
            pose,
            memoryShardModelHalfWidth,
            memoryShardModelHalfDepth,
          )
        ) {
          this.handled.set(shard.id, shard.distance)
          this.collectedShards.set(shard.id, this.elapsed)
          emit({
            kind: "score",
            points: trackConfig.memoryShardScore,
            event: { label: "A memory came loose", feedbackKind: "shard" },
          })
        }
      }
      for (const checkpoint of this.checkpoints) {
        if (this.handled.has(checkpoint.id)) continue
        if (
          crossedRoadGate(
            from,
            this.vehicle,
            this.road.sample(checkpoint.distance),
            checkpoint.width / 2,
          )
        ) {
          this.handled.set(checkpoint.id, checkpoint.distance)
          emit({
            kind: "score",
            points: trackConfig.checkpointScore,
            event: { label: "The exit moved again", feedbackKind: "checkpoint" },
          })
          emit({ kind: "repair", amount: trackConfig.checkpointRepair })
        }
      }
      if (
        input.isDrifting &&
        isScoringDrift(this.vehicle, this.isOffRoad) &&
        this.projection.distance > this.progress - 0.5
      ) {
        emit({
          kind: "charge",
          amount: Math.abs(this.vehicle.slipAngle) * this.vehicle.speed * physicsStep * 24,
        })
      }
      if (!input.isDrifting && this.wasDrifting) emit({ kind: "cash-out" })
      this.wasDrifting = input.isDrifting
    })
  }
}
