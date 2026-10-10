import assert from "node:assert/strict"

import { resolveScreenSignal } from "../src/game/screenSignal"
import { useGameStore } from "../src/game/useGameStore"

const healthy = resolveScreenSignal(100, 0)
assert.equal(healthy.intensity, 0.06)
assert.equal(healthy.negative, 0)
assert.equal(healthy.blockOpacity, 0)

let previous = healthy
for (const integrity of [90, 70, 50, 25, 10, 0]) {
  const signal = resolveScreenSignal(integrity, 0)
  assert(signal.intensity > previous.intensity, "Losing integrity must strengthen interference")
  assert(signal.blockOpacity > previous.blockOpacity, "Damage must increase visible color blocks")
  assert(signal.fringe > previous.fringe, "Damage must strengthen chromatic separation")
  assert(signal.negative >= previous.negative, "Lower integrity must not weaken negative pulses")
  assert(signal.duration < previous.duration, "Lower integrity must shorten the glitch cycle")
  previous = signal
}
assert(previous.negative > 0.8, "Critical damage must produce a recognizable negative image")

for (const integrity of [100, 25, 0]) {
  let intensity = 0
  let blocks = 0
  for (const darkness of [0, 0.2, 0.5, 0.8, 1]) {
    const signal = resolveScreenSignal(integrity, darkness)
    assert(signal.intensity >= intensity, "Approaching the road end must not weaken the signal")
    assert(signal.blockOpacity >= blocks, "Color blocks must grow as the visible opening closes")
    assert(signal.intensity <= 1 && signal.blockOpacity <= 1, "Stacked effects must stay bounded")
    intensity = signal.intensity
    blocks = signal.blockOpacity
    if (darkness >= 0.8) {
      assert.equal(
        signal.negative,
        0,
        "A closed vignette must never become an inverted white field",
      )
      assert.equal(signal.hue, 0, "Full-screen color shifts must yield to localized dropouts")
    }
  }
  assert.equal(intensity, 1)
  assert(blocks > 0.4, "Color blocks must remain visible on the end dialog's black background")
}
assert.deepEqual(resolveScreenSignal(150, -1), healthy)
assert.deepEqual(resolveScreenSignal(-20, 2), resolveScreenSignal(0, 1))

useGameStore.getState().start()
useGameStore.getState().registerScreenImpact()
assert.equal(useGameStore.getState().integrity, 100, "Guardrail feedback must not reduce integrity")
assert.equal(useGameStore.getState().impactId, 0, "Guardrails must not trigger damage color bursts")
assert.equal(useGameStore.getState().screenImpactId, 1, "Guardrails must retain tracking feedback")
useGameStore.getState().damage(75)
const damaged = useGameStore.getState()
assert.equal(damaged.integrity, 25)
assert.equal(damaged.impactId, 1)
assert.equal(damaged.screenImpactId, 2)
useGameStore.getState().repair(40)
assert(
  resolveScreenSignal(useGameStore.getState().integrity, 0).intensity <
    resolveScreenSignal(damaged.integrity, 0).intensity,
  "Checkpoint repair must reduce persistent corruption without resetting the run",
)
assert.equal(useGameStore.getState().impactId, 1, "Repair must not trigger a new damage burst")
useGameStore.getState().damage(100)
assert.equal(useGameStore.getState().status, "ended")
assert.equal(useGameStore.getState().impactId, 2, "Fatal damage must retain its final impact event")
useGameStore.getState().endAtRoadBoundary()
useGameStore.getState().restart()
const restarted = useGameStore.getState()
assert.equal(restarted.impactId, 0)
assert.equal(restarted.screenImpactId, 0)
assert.deepEqual(resolveScreenSignal(restarted.integrity, restarted.reverseDarkness), healthy)

console.log("screen signal rules ok")
