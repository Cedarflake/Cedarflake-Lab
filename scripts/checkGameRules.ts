import { readBestScore } from "../src/game/bestScoreStorage"
import { clamp, lerp, wrapDistance } from "../src/game/number"
import { willEndRunAfterDamage } from "../src/game/runState"

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(!willEndRunAfterDamage(23, 22), "Expected non-fatal damage above the threshold")
assert(willEndRunAfterDamage(22, 22), "Expected exact-threshold damage to end the run")
assert(willEndRunAfterDamage(12, 22), "Expected overkill damage to end the run")
assert(readBestScore() === 0, "Expected best score storage to initialize outside the browser")
assert(clamp(-2, 0, 1) === 0, "Expected clamp to honor the lower bound")
assert(clamp(3, 0, 1) === 1, "Expected clamp to honor the upper bound")
assert(clamp(0.4, 0, 1) === 0.4, "Expected clamp to preserve in-range values")
assert(lerp(10, 20, 0.25) === 12.5, "Expected lerp to interpolate linearly")
assert(wrapDistance(23, 10) === 3, "Expected wrapDistance to wrap positive distances")
assert(wrapDistance(-2, 10) === 8, "Expected wrapDistance to wrap negative distances")

console.log("game rules ok")
