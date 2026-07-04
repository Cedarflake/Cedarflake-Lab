export function resolveBoostedSpeed(currentSpeed: number, boostAmount: number, speedLimit: number) {
  return Math.max(currentSpeed, Math.min(currentSpeed + boostAmount, speedLimit))
}
