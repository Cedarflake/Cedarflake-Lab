import assert from "node:assert/strict"
import test from "node:test"

import {
  assertReleaseVersion,
  assertValidSemVer,
} from "../scripts/version.ts"

test("SemVer validation accepts stable, prerelease, and build versions", () => {
  for (const version of ["0.3.0", "1.0.0-rc.1", "1.0.0+build.1"]) {
    assert.equal(assertValidSemVer(version, "version"), version)
  }
})

test("SemVer validation rejects invalid and non-string versions", () => {
  for (const version of ["01.0.0", "1.0.0-01", "1.0.0-alpha.01", null]) {
    assert.throws(
      () => assertValidSemVer(version, "version"),
      /version must be valid SemVer/,
    )
  }
})

test("unchanged output does not require a version increase", () => {
  assert.doesNotThrow(() => {
    assertReleaseVersion({
      baseVersion: "1.0.0",
      currentVersion: "1.0.0",
      hasGeneratedOutputChanged: false,
    })
  })
})

test("changed output rejects equal, downgraded, and build-only versions", () => {
  for (const currentVersion of ["1.0.0", "0.9.9", "1.0.0+build.2"]) {
    assert.throws(
      () => {
        assertReleaseVersion({
          baseVersion: "1.0.0+build.1",
          currentVersion,
          hasGeneratedOutputChanged: true,
        })
      },
      /is not greater than/,
    )
  }
})

test("changed output accepts higher SemVer precedence", () => {
  for (const [baseVersion, currentVersion] of [
    ["1.0.0-rc.1", "1.0.0"],
    ["1.0.0", "1.0.1"],
    ["1.0.0", "1.1.0"],
  ]) {
    assert.doesNotThrow(() => {
      assertReleaseVersion({
        baseVersion,
        currentVersion,
        hasGeneratedOutputChanged: true,
      })
    })
  }
})
