import { clamp, lerp } from "./number"

export interface RoadPoint {
  x: number
  z: number
  heading: number
  distance: number
  curvature: number
}

export interface RoadProjection extends RoadPoint {
  offset: number
}

export const roadSampleSpacing = 2
export const roadChunkLength = 48
export const roadLookBehind = 672
export const roadLookAhead = 672

export function roadWindowStart(distance: number) {
  return Math.floor((distance - roadLookBehind) / roadChunkLength) * roadChunkLength
}

function noise(index: number) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

function sectionAt(index: number, heading: number) {
  const opening = [
    { length: 120, heading: 0 },
    { length: 144, heading: -0.64 },
    { length: 64, heading: -0.64 },
    { length: 220, heading: 0.66 },
    { length: 64, heading: 0.66 },
    { length: 132, heading: -0.34 },
    { length: 132, heading: 0.38 },
    { length: 96, heading: 0.38 },
  ]
  const preset = opening[index]
  if (preset) return preset

  const isStraight = index % 3 === 1
  const nextHeading = isStraight ? heading : (noise(index) - 0.5) * 1.9
  const angle = Math.abs(nextHeading - heading)

  // Bounded headings keep the streamed corridor from crossing itself. Length scales
  // with angle so random bends cannot exceed the designed curvature limit.
  return {
    length: Math.ceil((isStraight ? 70 + noise(index + 7) * 90 : 100 + angle * 105) / 2) * 2,
    heading: nextHeading,
  }
}

export class EndlessRoad {
  private points: RoadPoint[] = [{ x: 0, z: 0, heading: 0, distance: 0, curvature: 0 }]
  private firstIndex = 0
  private sectionIndex = 0
  private sectionStart = 0
  private sectionHeading = 0
  private section = sectionAt(0, 0)

  get sampleCount() {
    return this.points.length
  }

  clearanceAt(x: number, z: number) {
    if (z >= 0) return Math.abs(x)
    let low = 0
    let high = this.points.length - 1
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      const point = this.points[middle]
      if (point && point.z > z) low = middle + 1
      else high = middle
    }
    const point = this.points[low]
    if (!point) return Infinity
    return Math.abs(
      (x - point.x) * Math.cos(point.heading) - (z - point.z) * Math.sin(point.heading),
    )
  }

  private headingAt(distance: number) {
    const t = clamp((distance - this.sectionStart) / this.section.length, 0, 1)
    const angle = this.section.heading - this.sectionHeading
    return {
      heading: this.sectionHeading + angle * t * t * (3 - 2 * t),
      curvature: (angle * 6 * t * (1 - t)) / this.section.length,
    }
  }

  ensure(distance: number) {
    const initial = this.points.at(-1)
    if (!initial) throw new Error("Road has no origin")
    let last: RoadPoint = initial

    while (last.distance < distance + roadSampleSpacing) {
      if (last.distance >= this.sectionStart + this.section.length) {
        this.sectionStart += this.section.length
        this.sectionHeading = this.section.heading
        this.sectionIndex += 1
        this.section = sectionAt(this.sectionIndex, this.sectionHeading)
      }
      const middle = this.headingAt(last.distance + roadSampleSpacing / 2)
      const nextDistance = last.distance + roadSampleSpacing
      const next: RoadPoint = {
        x: last.x - Math.sin(middle.heading) * roadSampleSpacing,
        z: last.z - Math.cos(middle.heading) * roadSampleSpacing,
        distance: nextDistance,
        ...this.headingAt(nextDistance),
      }
      this.points.push(next)
      last = next
    }
  }

  sample(distance: number): RoadPoint {
    if (distance < 0) return { x: 0, z: -distance, distance, heading: 0, curvature: 0 }
    this.ensure(distance)
    const index = Math.floor(distance / roadSampleSpacing) - this.firstIndex
    const a = this.points[index]
    const b = this.points[index + 1]
    if (!a || !b) throw new Error(`Road sample ${distance} is outside the retained window`)
    const t = (distance - a.distance) / roadSampleSpacing
    return {
      x: lerp(a.x, b.x, t),
      z: lerp(a.z, b.z, t),
      heading: lerp(a.heading, b.heading, t),
      curvature: lerp(a.curvature, b.curvature, t),
      distance,
    }
  }

  atOffset(distance: number, offset = 0): RoadPoint {
    const point = this.sample(distance)
    const lateral = resolveTrackLateralOffset(offset, point.heading)
    return { ...point, x: point.x + lateral.x, z: point.z + lateral.z }
  }

  project(x: number, z: number, hint: number): RoadProjection {
    const start = Math.max(
      this.firstIndex === 0
        ? -roadLookBehind - roadChunkLength
        : this.firstIndex * roadSampleSpacing,
      Math.floor((hint - 40) / 2) * 2,
    )
    const end = hint + 40
    let bestDistance = hint
    let bestSquared = Infinity
    for (let distance = start; distance <= end; distance += roadSampleSpacing) {
      const a = this.sample(distance)
      const b = this.sample(distance + roadSampleSpacing)
      const dx = b.x - a.x
      const dz = b.z - a.z
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1)
      const squared = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2
      if (squared < bestSquared) {
        bestSquared = squared
        bestDistance = distance + t * roadSampleSpacing
      }
    }
    const point = this.sample(bestDistance)
    return {
      ...point,
      offset: (x - point.x) * Math.cos(point.heading) - (z - point.z) * Math.sin(point.heading),
    }
  }

  retainAround(distance: number) {
    this.ensure(distance + roadLookAhead + 200)
    const nextFirst = Math.max(0, Math.floor((distance - roadLookBehind - 160) / 2))
    const removeCount = nextFirst - this.firstIndex
    if (removeCount > 0) {
      this.points.splice(0, removeCount)
      this.firstIndex = nextFirst
    }
  }
}

export function resolveTrackLateralOffset(offset: number, heading: number) {
  return { x: offset * Math.cos(heading), z: -offset * Math.sin(heading) }
}
