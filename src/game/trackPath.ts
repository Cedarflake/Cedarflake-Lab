export function resolveTrackCenter(distance: number) {
  return Math.sin(distance * 0.0135) * 3.15 + Math.sin(distance * 0.0056 + 1.2) * 1.55
}

export function resolveTrackHeading(distance: number) {
  const lookBehind = resolveTrackCenter(distance - 10)
  const lookAhead = resolveTrackCenter(distance + 10)

  return Math.atan2(lookAhead - lookBehind, 20)
}

export function resolveRelativeTrackCenter(distance: number, originDistance: number) {
  return resolveTrackCenter(distance) - resolveTrackCenter(originDistance)
}

export function resolveRelativeTrackPose(
  distance: number,
  originDistance: number,
  zAnchor: number,
) {
  const heading = resolveTrackHeading(distance)

  return {
    heading,
    x: resolveRelativeTrackCenter(distance, originDistance),
    z: -(distance - originDistance) + zAnchor,
  }
}

export function resolveTrackLaneOffset(lane: number, heading: number, laneWidth: number) {
  return resolveTrackLateralOffset(lane * laneWidth, heading)
}

export function resolveTrackLateralOffset(offset: number, heading: number) {
  return {
    x: offset * Math.cos(heading),
    z: -offset * Math.sin(heading),
  }
}
