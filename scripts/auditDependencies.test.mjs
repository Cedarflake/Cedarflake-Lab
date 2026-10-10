import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { load as loadYaml } from "js-yaml"

import { assertBracesPatch, evaluateAudit } from "./auditDependencies.mjs"

const patchHash = "ddeca82af6f30abb5c2e545320680269695f8d543891a32a078029087b433a35"
const patchedBraces = {
  github_advisory_id: "GHSA-vfj7-8cjw-p6xm",
  module_name: "braces",
  severity: "high",
  findings: [{ version: "3.0.3", paths: ["app>micromatch>braces"] }],
}

function auditResult(advisories = []) {
  const vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
  for (const advisory of advisories) vulnerabilities[advisory.severity] += 1
  return {
    status: vulnerabilities.high + vulnerabilities.critical > 0 ? 1 : 0,
    stdout: JSON.stringify({
      advisories: Object.fromEntries(advisories.map((advisory, index) => [index, advisory])),
      metadata: { vulnerabilities },
    }),
  }
}

function patchInputs() {
  return {
    workspace: loadYaml(readFileSync(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8")),
    lockfile: loadYaml(readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8")),
  }
}

test("accepts a clean audit without requiring an unrelated patch", () => {
  const audit = evaluateAudit(auditResult(), () => assert.fail("Unexpected patch verification"))
  assert.deepEqual(audit.blocking, [])
  assert.deepEqual(audit.mitigated, [])
})

test("requires successful patch verification for the exact advisory and package version", () => {
  let checks = 0
  const audit = evaluateAudit(auditResult([patchedBraces]), () => checks++)
  assert.equal(checks, 1)
  assert.deepEqual(audit.mitigated, [patchedBraces])
  assert.deepEqual(audit.blocking, [])
  assert.throws(
    () =>
      evaluateAudit(auditResult([patchedBraces]), () => {
        throw new Error("Installed patch is missing")
      }),
    /Installed patch is missing/,
  )
})

test("does not exempt another version, another package, or another advisory", () => {
  for (const changed of [
    { findings: [{ version: "3.0.2" }] },
    { findings: [{ version: "3.0.3" }, { version: "3.0.2" }] },
    { module_name: "another-package" },
    { github_advisory_id: "GHSA-xxxx-yyyy-zzzz" },
  ]) {
    const advisory = { ...patchedBraces, ...changed }
    const audit = evaluateAudit(auditResult([advisory]), () => assert.fail("Unexpected exemption"))
    assert.deepEqual(audit.blocking, [advisory])
    assert.deepEqual(audit.mitigated, [])
  }
})

test("unrelated high and critical advisories still block alongside the patched finding", () => {
  for (const severity of ["high", "critical"]) {
    const other = { ...patchedBraces, severity, github_advisory_id: "GHSA-xxxx-yyyy-zzzz" }
    const audit = evaluateAudit(auditResult([patchedBraces, other]), () => {})
    assert.deepEqual(audit.blocking, [other])
    assert.equal(audit.mitigated.length, 1)
  }
})

test("retains the high severity threshold", () => {
  const advisory = { ...patchedBraces, severity: "moderate" }
  const audit = evaluateAudit(auditResult([advisory]), () => assert.fail("Unexpected exemption"))
  assert.deepEqual(audit.blocking, [])
  assert.equal(audit.counts.moderate, 1)
})

test("fails closed on process, registry, schema, and incomplete-report errors", () => {
  const incomplete = JSON.parse(auditResult().stdout)
  incomplete.metadata.vulnerabilities.high = 1
  for (const result of [
    { status: null, error: new Error("Registry timeout") },
    { status: 2, stdout: "{}" },
    { status: 1, stdout: "registry unavailable" },
    { status: 1, stdout: JSON.stringify({ error: "Registry unavailable" }) },
    { status: 0, stdout: "{}" },
    { status: 0, stdout: JSON.stringify(incomplete) },
    { ...auditResult(), status: 1 },
    auditResult([{ ...patchedBraces, findings: [] }]),
  ]) {
    assert.throws(() => evaluateAudit(result, () => {}))
  }
})

test("requires the reviewed patch in workspace settings and every lockfile instance", () => {
  const { workspace, lockfile } = patchInputs()
  assert.doesNotThrow(() => assertBracesPatch(workspace, lockfile, patchHash))
  for (const mutate of [
    ({ workspace }) => delete workspace.patchedDependencies["braces@3.0.3"],
    ({ lockfile }) => delete lockfile.patchedDependencies["braces@3.0.3"],
    ({ lockfile }) => {
      lockfile.patchedDependencies["braces@3.0.3"] = "different-patch"
    },
    ({ lockfile }) => {
      lockfile.packages["braces@3.0.2"] = {}
    },
    ({ lockfile }) => {
      lockfile.snapshots["braces@3.0.3"] = {}
    },
    ({ lockfile }) => {
      lockfile.snapshots = {}
    },
  ]) {
    const inputs = patchInputs()
    mutate(inputs)
    assert.throws(() => assertBracesPatch(inputs.workspace, inputs.lockfile, patchHash))
  }
  assert.throws(() => assertBracesPatch(workspace, lockfile, "modified-patch"))
})
