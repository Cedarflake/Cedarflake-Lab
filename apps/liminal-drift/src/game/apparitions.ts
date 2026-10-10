import { sceneryConfig, trackConfig } from "./gameConfig"
import { clamp } from "./number"
import type { EnvironmentPart } from "./environment"
import type { SolidBox } from "./solidCollision"

export const skyEyeCount = 64
export const calmSkyEyeCount = 16

export interface PictureAnchor {
  distance: number
  offset: number
  direction: number
  yaw: number
}

export interface PictureLayout {
  index: number
  side: -1 | 1
  distance: number
  offset: number
  yaw: number
  scale: number
}

function noise(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

export function createPictureLayout(): PictureLayout[] {
  const config = sceneryConfig.pictureFrames
  let distance: number = config.originStart
  return Array.from({ length: config.count }, (_, index) => {
    const seed = index * 29 + 73
    const side = noise(seed) < 0.5 ? -1 : 1
    distance += config.minimumSpacing + noise(seed + 1) * config.spacingSpread
    return {
      index,
      side,
      distance,
      offset:
        side *
        (trackConfig.roadHalfWidth + config.baseSideOffset + noise(seed + 2) * config.sideSpread),
      yaw: (noise(seed + 3) - 0.5) * 1.5,
      scale: 0.72 + noise(seed + 4) * 0.46,
    }
  })
}

export function overlapsPictureSpace(
  x: number,
  z: number,
  box: Pick<SolidBox, "x" | "z" | "heading" | "halfWidth" | "halfDepth">,
) {
  const dx = x - box.x
  const dz = z - box.z
  const localX = dx * Math.cos(box.heading) - dz * Math.sin(box.heading)
  const localZ = dx * Math.sin(box.heading) + dz * Math.cos(box.heading)
  return (
    Math.hypot(
      Math.max(0, Math.abs(localX) - box.halfWidth),
      Math.max(0, Math.abs(localZ) - box.halfDepth),
    ) < 2.3
  )
}

export function obscuresPicture(
  camera: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  part: EnvironmentPart,
) {
  const cosine = Math.cos(part.heading)
  const sine = Math.sin(part.heading)
  const fromX = camera.x - part.x
  const fromZ = camera.z - part.z
  const dx = target.x - camera.x
  const dz = target.z - camera.z
  const isDune = part.shape === "dune"
  const centerY = part.y + (isDune ? part.height / 2 : 0)
  const rimScale = isDune ? 1.16 : 1
  const axes = [
    [fromX * cosine - fromZ * sine, dx * cosine - dz * sine, (part.width * rimScale) / 2],
    [camera.y - centerY, target.y - camera.y, part.height / 2],
    [fromX * sine + fromZ * cosine, dx * sine + dz * cosine, (part.depth * rimScale) / 2],
  ] as const
  let near = 0
  let far = 1
  for (const [origin, delta, radius] of axes) {
    if (Math.abs(delta) < 1e-8) {
      if (Math.abs(origin) > radius) return false
      continue
    }
    const a = (-radius - origin) / delta
    const b = (radius - origin) / delta
    near = Math.max(near, Math.min(a, b))
    far = Math.min(far, Math.max(a, b))
    if (near > far) return false
  }
  return far > 0 && near < 1
}

export function resolveApparitionSeverity(integrity: number) {
  return clamp(1 - integrity / trackConfig.lowIntegrityThreshold, 0, 1)
}

export class ApparitionClock {
  private lastElapsed = 0
  private progress: number
  private readonly index: number
  private readonly pace: number

  constructor(index: number, pace = 1) {
    this.index = index
    this.pace = pace
    this.progress = noise(index + 17) * 0.85
  }

  advance(elapsed: number, severity: number) {
    const delta = Math.max(0, elapsed - this.lastElapsed)
    this.lastElapsed = elapsed
    if (severity <= 0) {
      this.progress = noise(this.index + 17) * 0.85
      return false
    }
    this.progress += delta / ((2.8 - severity * 2.2) * this.pace)
    if (this.progress < 1) return false
    this.progress %= 1
    return true
  }
}

function skyAnchor(index: number, generation: number, x: number, z: number) {
  const seed = index * 23 + generation * 137
  const tier = index % 4
  const angle = index * 2.39996323 + (noise(seed) - 0.5) * 0.3 + generation * 1.7
  const radius = 150 + noise(seed + 1) * 75
  const width = 7 + noise(seed + 2) * 6
  return {
    x: x + Math.sin(angle) * radius,
    y: 6 + radius * (0.045 + tier * 0.06 + noise(seed + 3) * 0.025),
    z: z - Math.cos(angle) * radius,
    width,
    opacity: 0.55 + noise(index + 5) * 0.35,
  }
}

export class SkyApparitions {
  readonly eyes = Array.from({ length: skyEyeCount }, (_, index) => ({
    ...skyAnchor(index, 0, 0, 0),
    index,
    generation: 0,
    visible: false,
    size: 0,
    clock: new ApparitionClock(index),
  }))

  update(elapsed: number, integrity: number, x: number, z: number) {
    const severity = resolveApparitionSeverity(integrity)
    const count = calmSkyEyeCount + Math.ceil(severity * (skyEyeCount - calmSkyEyeCount))
    for (const eye of this.eyes) {
      const isVisible = eye.index < count
      const shouldJump = eye.clock.advance(elapsed, isVisible ? severity : 0)
      if (isVisible) {
        const distance = Math.hypot(eye.x - x, eye.z - z)
        if (shouldJump || distance > 295 || distance < 50) eye.generation += 1
        if (!eye.visible || shouldJump || distance > 295 || distance < 50) {
          Object.assign(eye, skyAnchor(eye.index, eye.generation, x, z))
        }
      }
      eye.visible = isVisible
      eye.size = eye.width * (1 + severity * 0.85)
    }
    return this.eyes
  }
}

export function findPictureAnchor(
  index: number,
  generation: number,
  distance: number,
  direction: number,
  isVisible: (anchor: PictureAnchor) => boolean,
  occupied: readonly PictureAnchor[] = [],
) {
  const seed = index * 37 + generation * 113
  const candidates = []
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidateSeed = seed + attempt * 17
    const side = noise(candidateSeed) < 0.5 ? -1 : 1
    const anchor = {
      distance: distance + direction * (24 + noise(candidateSeed + 1) * 116),
      offset: side * (trackConfig.barrierOffset + 2.5 + noise(candidateSeed + 2) * 31),
      direction,
      yaw: (direction < 0 ? Math.PI : 0) + (noise(candidateSeed + 3) - 0.5) * 1.5,
    }
    const separation = occupied.length
      ? Math.min(
          ...occupied.map((other) =>
            Math.hypot((anchor.distance - other.distance) * 0.3, anchor.offset - other.offset),
          ),
        )
      : 0
    candidates.push({
      anchor,
      rank: separation + Math.abs(anchor.offset) * 0.12 + noise(candidateSeed + 4) * 5,
    })
  }
  candidates.sort((a, b) => b.rank - a.rank)
  for (const { anchor } of candidates) if (isVisible(anchor)) return anchor
  return null
}

export class PictureApparition {
  private readonly clock: ApparitionClock
  private readonly index: number
  private anchor: PictureAnchor | null = null
  private searchAfter = 0
  generation = 0

  constructor(index: number) {
    this.index = index
    this.clock = new ApparitionClock(index + skyEyeCount, 1.8)
  }

  update(
    elapsed: number,
    integrity: number,
    distance: number,
    direction: number,
    isVisible: (anchor: PictureAnchor) => boolean,
    occupied?: () => readonly PictureAnchor[],
  ) {
    const severity = resolveApparitionSeverity(integrity)
    const shouldJump = this.clock.advance(elapsed, severity)
    const isPassing = this.anchor && (this.anchor.distance - distance) * direction < 24
    if (severity > 0 && elapsed >= this.searchAfter && (shouldJump || isPassing)) {
      this.searchAfter = elapsed + 0.35
      this.generation += 1
      const next = findPictureAnchor(
        this.index,
        this.generation,
        distance,
        direction,
        isVisible,
        occupied?.(),
      )
      if (next) {
        this.anchor = next
      }
    }
    // Healing stops the jumps without snapping a visible frame back to its old slot.
    if (
      this.anchor &&
      (this.anchor.distance < distance - 640 || this.anchor.distance > distance + 800)
    ) {
      this.anchor = null
    }
    return this.anchor
  }
}
