import assert from "node:assert/strict"
import test from "node:test"
import { runInNewContext } from "node:vm"

import { observeStoppedSpeed } from "./browserDrivingChecks.mjs"

/** @param {string | null} initialSpeed */
function monitor(initialSpeed) {
  const element = { textContent: initialSpeed }
  /** @type {(() => void) | undefined} */
  let callback
  let isConnected = false
  const observation = runInNewContext(`(${observeStoppedSpeed.toString()})(element)`, {
    element,
    MutationObserver: class {
      /** @param {() => void} onMutation */
      constructor(onMutation) {
        callback = onMutation
      }
      observe() {
        isConnected = true
      }
      disconnect() {
        isConnected = false
      }
    },
  })
  return {
    observation,
    get isConnected() {
      return isConnected
    },
    /** @param {string | null} speed */
    update(speed) {
      element.textContent = speed
      if (isConnected) callback?.()
    },
  }
}

test("retains a real stop when delayed polling sees reverse speed", () => {
  const state = monitor("42")
  assert.equal(state.observation.hasStopped, false)
  state.update("0")
  state.update("12")
  assert.equal(state.observation.hasStopped, true)
  assert.equal(state.isConnected, false)
})

test("does not report a stop without a valid stopped-speed sample", () => {
  const state = monitor("42")
  for (const speed of ["", " ", null, "NaN", "Infinity", "-1", "1", "12"]) {
    state.update(speed)
    assert.equal(state.observation.hasStopped, false)
  }
  state.update("0")
  assert.equal(state.observation.hasStopped, true)
})

test("requires a moving car before observing the stop", () => {
  for (const speed of ["0", "", " ", null, "NaN", "Infinity", "-1"]) {
    assert.throws(() => monitor(speed), /Expected a moving car/)
  }
})

test("disconnects when a browser check fails before stopping", () => {
  const state = monitor("42")
  state.observation.disconnect()
  state.update("0")
  assert.equal(state.observation.hasStopped, false)
  assert.equal(state.isConnected, false)
})
