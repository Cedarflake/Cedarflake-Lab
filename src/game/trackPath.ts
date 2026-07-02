export function resolveTrackCenter(distance: number) {
  return Math.sin(distance * 0.012) * 1.8 + Math.sin(distance * 0.0048 + 1.2) * 1.1
}

export function resolveTrackHeading(distance: number) {
  const lookBehind = resolveTrackCenter(distance - 8)
  const lookAhead = resolveTrackCenter(distance + 8)

  return Math.atan2(lookAhead - lookBehind, 16)
}

export function resolveRelativeTrackCenter(distance: number, originDistance: number) {
  return resolveTrackCenter(distance) - resolveTrackCenter(originDistance)
}
