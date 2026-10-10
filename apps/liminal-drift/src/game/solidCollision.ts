import type { VehicleState } from "./vehicle"
import { trackConfig } from "./gameConfig"
import type { EndlessRoad } from "./trackPath"

export interface SolidBox {
  id: string
  x: number
  z: number
  heading: number
  halfWidth: number
  halfDepth: number
  outline?: readonly (readonly [number, number])[]
}

export interface SolidContact {
  time: number
  normalX: number
  normalZ: number
  penetration: number
}

export const vehicleHalfWidth = 1.09
export const vehicleHalfDepth = 1.62
const separationSkin = 0.004
type VehiclePose = Pick<VehicleState, "x" | "z" | "heading">

export function vehicleLateralExtent(heading: number) {
  return (
    vehicleHalfWidth * Math.abs(Math.cos(heading)) + vehicleHalfDepth * Math.abs(Math.sin(heading))
  )
}

export function sweepSolid(from: VehiclePose, to: VehiclePose, box: SolidBox): SolidContact | null {
  const dx = to.x - from.x
  const dz = to.z - from.z
  let enter = 0
  let leave = 1
  let normalX = 0
  let normalZ = 0
  let penetration = Infinity
  let overlapNormalX = 0
  let overlapNormalZ = 0
  let isInside = true
  const axes = [box.heading, box.heading + Math.PI / 2, to.heading, to.heading + Math.PI / 2]
  if (box.outline) {
    for (let index = 0; index < box.outline.length; index += 1) {
      const a = box.outline[index]
      const b = box.outline[(index + 1) % box.outline.length]
      if (a && b) axes.push(box.heading + Math.atan2(b[0] - a[0], b[1] - a[1]))
    }
  }
  for (const angle of axes) {
    const ax = Math.cos(angle)
    const az = -Math.sin(angle)
    const cosine = Math.cos(box.heading - angle)
    const sine = Math.sin(box.heading - angle)
    const solidExtent = box.outline
      ? Math.max(...box.outline.map(([x, z]) => Math.abs(x * cosine + z * sine)))
      : box.halfWidth * Math.abs(cosine) + box.halfDepth * Math.abs(sine)
    const extent =
      Math.max(
        vehicleLateralExtent(from.heading - angle),
        vehicleLateralExtent(to.heading - angle),
      ) + solidExtent
    const start = (from.x - box.x) * ax + (from.z - box.z) * az
    const movement = dx * ax + dz * az
    const overlap = extent - Math.abs(start)
    if (overlap < 0) isInside = false
    if (overlap < penetration) {
      penetration = overlap
      const sign = Math.sign(start) || -Math.sign(movement) || 1
      overlapNormalX = ax * sign
      overlapNormalZ = az * sign
    }
    if (Math.abs(movement) < 1e-10) {
      if (overlap < 0) return null
      continue
    }
    const a = (-extent - start) / movement
    const b = (extent - start) / movement
    const near = Math.min(a, b)
    if (near > enter) {
      enter = near
      normalX = -Math.sign(movement) * ax
      normalZ = -Math.sign(movement) * az
    }
    leave = Math.min(leave, Math.max(a, b))
    if (enter > leave) return null
  }
  if (isInside) return { time: 0, normalX: overlapNormalX, normalZ: overlapNormalZ, penetration }
  if (enter < 0 || enter > 1 || leave < 0) return null
  return { time: enter, normalX, normalZ, penetration: 0 }
}

export function deflectVehicle(vehicle: VehicleState, normalX: number, normalZ: number) {
  const approach = -(vehicle.velocityX * normalX + vehicle.velocityZ * normalZ)
  if (approach <= 0) return 0
  vehicle.velocityX += normalX * approach * 1.08
  vehicle.velocityZ += normalZ * approach * 1.08
  const tangentX = -normalZ
  const tangentZ = normalX
  const tangentSpeed = vehicle.velocityX * tangentX + vehicle.velocityZ * tangentZ
  const friction = Math.min(Math.abs(tangentSpeed), approach * 0.2) * Math.sign(tangentSpeed)
  vehicle.velocityX -= tangentX * friction
  vehicle.velocityZ -= tangentZ * friction
  vehicle.speed = Math.hypot(vehicle.velocityX, vehicle.velocityZ)
  if (approach > 3) vehicle.yawRate *= 0.3
  return approach
}

export function resolveRoadBarrier(vehicle: VehicleState, road: EndlessRoad, hint: number) {
  let projection = road.project(vehicle.x, vehicle.z, hint)
  let impact = 0
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const extent = vehicleLateralExtent(vehicle.heading - projection.heading)
    const cornerAllowance =
      (vehicleHalfDepth ** 2 + vehicleHalfWidth ** 2) * Math.abs(projection.curvature) * 0.6
    const limit =
      trackConfig.barrierOffset -
      trackConfig.barrierHalfWidth -
      extent -
      separationSkin -
      cornerAllowance
    const excess = Math.abs(projection.offset) - limit
    if (excess <= 0) break
    const side = Math.sign(projection.offset)
    const normalX = -side * Math.cos(projection.heading)
    const normalZ = side * Math.sin(projection.heading)
    vehicle.x += normalX * excess
    vehicle.z += normalZ * excess
    impact = Math.max(impact, deflectVehicle(vehicle, normalX, normalZ))
    projection = road.project(vehicle.x, vehicle.z, projection.distance)
  }
  return { projection, impact }
}

export function resolveSolidMovement(
  vehicle: VehicleState,
  previous: VehiclePose,
  solids: readonly SolidBox[],
) {
  let from = { ...previous }
  let strongestImpact = 0
  let touchedId: string | null = null
  for (let iteration = 0; iteration < 4; iteration += 1) {
    let nearest: { contact: SolidContact; box: SolidBox } | null = null
    for (const box of solids) {
      const reach =
        Math.hypot(box.halfWidth, box.halfDepth) +
        3 +
        Math.hypot(vehicle.x - from.x, vehicle.z - from.z)
      if (Math.abs(box.x - from.x) > reach || Math.abs(box.z - from.z) > reach) continue
      const contact = sweepSolid(from, vehicle, box)
      if (!contact) continue
      const movementNormal =
        (vehicle.x - from.x) * contact.normalX + (vehicle.z - from.z) * contact.normalZ
      if (contact.penetration < separationSkin && movementNormal >= 0) continue
      if (
        !nearest ||
        contact.time < nearest.contact.time ||
        (contact.time === 0 && contact.penetration > nearest.contact.penetration)
      )
        nearest = { contact, box }
    }
    if (!nearest) break
    const { contact, box } = nearest
    const dx = vehicle.x - from.x
    const dz = vehicle.z - from.z
    const x = from.x + dx * contact.time + contact.normalX * (contact.penetration + separationSkin)
    const z = from.z + dz * contact.time + contact.normalZ * (contact.penetration + separationSkin)
    let slideX = dx * (1 - contact.time)
    let slideZ = dz * (1 - contact.time)
    const into = Math.min(0, slideX * contact.normalX + slideZ * contact.normalZ)
    slideX -= contact.normalX * into
    slideZ -= contact.normalZ * into
    vehicle.x = x + slideX
    vehicle.z = z + slideZ
    from = { x, z, heading: vehicle.heading }
    const impact = deflectVehicle(vehicle, contact.normalX, contact.normalZ)
    if (impact > strongestImpact) {
      strongestImpact = impact
      touchedId = box.id
    }
  }
  return { impact: strongestImpact, id: touchedId }
}
