import { clamp } from "./number"

export function resolveScreenSignal(integrity: number, reverseDarkness: number) {
  const damage = (1 - clamp(integrity, 0, 100) / 100) ** 1.4
  const darkness = clamp(reverseDarkness, 0, 1)
  const severity = 1 - (1 - damage * 0.8) * (1 - darkness)
  // Inverting a closing black vignette would reopen it as a bright white field.
  const visibleSignal = clamp(1 - darkness * 1.6, 0, 1)

  return {
    severity,
    intensity: 0.06 + severity * 0.94,
    duration: 4200 - severity * 2600,
    negative: Math.max(clamp((damage - 0.16) / 0.7, 0, 1) * 0.92, darkness * 0.6) * visibleSignal,
    hue: visibleSignal > 0 ? severity * -110 * visibleSignal : 0,
    saturation: 1 + severity * 0.65 * visibleSignal,
    fringe: severity * 2.4,
    blockOpacity: severity * 0.52,
    visibleSignal,
  }
}
