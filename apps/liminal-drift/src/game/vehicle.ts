import type { PlayerInput } from "@/shared/types"

import { trackConfig } from "./gameConfig"
import { clamp } from "./number"

export interface VehicleState {
  x: number
  z: number
  heading: number
  velocityX: number
  velocityZ: number
  yawRate: number
  steering: number
  speed: number
  slipAngle: number
  travelled: number
  brakeHoldSeconds: number
}

export const physicsStep = 1 / 120
export const tireGrip = 17

export function createVehicle(): VehicleState {
  return {
    x: 0,
    z: 0,
    heading: 0,
    velocityX: 0,
    velocityZ: 0,
    yawRate: 0,
    steering: 0,
    speed: 0,
    slipAngle: 0,
    travelled: 0,
    brakeHoldSeconds: 0,
  }
}

export function steeringCurvature(speed: number) {
  return 0.19 / (1 + Math.max(0, speed) * 0.22)
}

export function stepVehicle(
  vehicle: VehicleState,
  input: PlayerInput,
  dt: number,
  isOffRoad: boolean,
) {
  vehicle.steering += (input.steer - vehicle.steering) * (1 - Math.exp(-dt * 7))
  const forwardX = -Math.sin(vehicle.heading)
  const forwardZ = -Math.cos(vehicle.heading)
  const rightX = Math.cos(vehicle.heading)
  const rightZ = -Math.sin(vehicle.heading)
  let forward = vehicle.velocityX * forwardX + vehicle.velocityZ * forwardZ
  let lateral = vehicle.velocityX * rightX + vehicle.velocityZ * rightZ
  const isDrifting = input.isDrifting && vehicle.speed > trackConfig.driftMinimumSpeed
  const grip = (isOffRoad ? 7 : tireGrip) * (isDrifting ? 0.58 : 1)
  const throttle = input.throttle * (input.brake > 0 ? 0 : 1)
  const resistance = 2.5 + vehicle.speed * 0.1 + (isOffRoad ? 11 + vehicle.speed * 0.4 : 0)
  vehicle.brakeHoldSeconds =
    input.brake > 0 && Math.abs(forward) < 0.5
      ? vehicle.brakeHoldSeconds + dt
      : forward < -0.1 && input.brake > 0
        ? vehicle.brakeHoldSeconds
        : 0
  const isReversing = input.brake > 0 && vehicle.brakeHoldSeconds >= 0.35
  if (isReversing) {
    forward = Math.max(-9, forward - input.brake * 13 * dt)
  } else if (input.brake > 0) {
    forward =
      Math.sign(forward) * Math.max(0, Math.abs(forward) - input.brake * trackConfig.braking * dt)
  } else {
    const engine = forward < trackConfig.maxSpeed ? throttle * trackConfig.baseAcceleration : 0
    forward += engine * dt
  }
  forward = Math.sign(forward) * Math.max(0, Math.abs(forward) - resistance * dt)

  // Tires can redirect only a limited amount of momentum per step. The body can
  // rotate faster than the velocity vector, producing actual lateral slip.
  const lateralCorrection = clamp(-lateral * (isDrifting ? 3 : 11), -grip, grip)
  lateral += lateralCorrection * dt
  if (Math.abs(forward) < 0.1 && Math.abs(lateral) < 0.1) lateral = 0
  vehicle.velocityX = forwardX * forward + rightX * lateral
  vehicle.velocityZ = forwardZ * forward + rightZ * lateral
  vehicle.speed = Math.hypot(vehicle.velocityX, vehicle.velocityZ)
  const desiredYaw =
    -vehicle.steering * forward * steeringCurvature(vehicle.speed) * (isDrifting ? 1.22 : 1)
  vehicle.yawRate += (desiredYaw - vehicle.yawRate) * (1 - Math.exp(-dt * (isDrifting ? 5 : 9)))
  vehicle.heading += vehicle.yawRate * dt
  vehicle.slipAngle = Math.atan2(lateral, Math.max(Math.abs(forward), 0.1))
  vehicle.x += vehicle.velocityX * dt
  vehicle.z += vehicle.velocityZ * dt
  vehicle.travelled += Math.sign(forward) * vehicle.speed * dt
}

export function isScoringDrift(vehicle: VehicleState, isOffRoad: boolean) {
  return (
    !isOffRoad &&
    vehicle.speed > trackConfig.driftMinimumSpeed &&
    Math.abs(vehicle.slipAngle) > 0.1 &&
    Math.abs(vehicle.slipAngle) < 1.1
  )
}

export function scaleVehicleSpeed(vehicle: VehicleState, scale: number) {
  vehicle.velocityX *= scale
  vehicle.velocityZ *= scale
  vehicle.speed *= scale
}

export function advancePhysics(accumulator: number, delta: number, step: () => boolean | void) {
  let remaining = accumulator + Math.min(delta, 0.1)
  while (remaining + 1e-9 >= physicsStep) {
    remaining -= physicsStep
    if (step() === false) return 0
  }
  return Math.max(0, remaining)
}
