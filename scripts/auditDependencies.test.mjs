import assert from "node:assert/strict"
import test from "node:test"

import { evaluateAudit } from "./auditDependencies.mjs"

const advisory = {
  github_advisory_id: "GHSA-vfj7-8cjw-p6xm",
  module_name: "braces",
  severity: "high",
  findings: [{ version: "3.0.3", paths: ["app>micromatch>braces"] }],
}

function auditResult(advisories = []) {
  const vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
  for (const finding of advisories) vulnerabilities[finding.severity] += 1
  return {
    status: advisories.length > 0 ? 1 : 0,
    stdout: JSON.stringify({
      advisories: Object.fromEntries(advisories.map((finding, index) => [index, finding])),
      metadata: { vulnerabilities },
    }),
  }
}

test("accepts a clean audit", () => {
  const audit = evaluateAudit(auditResult())
  assert.deepEqual(audit.blocking, [])
  assert.deepEqual(audit.counts, { info: 0, low: 0, moderate: 0, high: 0, critical: 0 })
})

test("does not exempt the formerly mitigated braces advisory if it returns", () => {
  const audit = evaluateAudit(auditResult([advisory]))
  assert.deepEqual(audit.blocking, [advisory])
})

test("blocks every high and critical advisory without package or version exceptions", () => {
  for (const severity of ["high", "critical"]) {
    for (const changed of [
      {},
      { findings: [{ version: "3.0.2" }] },
      { findings: [{ version: "3.0.3" }, { version: "3.0.2" }] },
      { module_name: "another-package" },
      { github_advisory_id: "GHSA-xxxx-yyyy-zzzz" },
    ]) {
      const finding = { ...advisory, severity, ...changed }
      assert.deepEqual(evaluateAudit(auditResult([finding])).blocking, [finding])
    }
  }
})

test("retains the high severity threshold and lower-severity counts", () => {
  const findings = ["info", "low", "moderate"].map((severity) => ({ ...advisory, severity }))
  const audit = evaluateAudit(auditResult(findings))
  assert.deepEqual(audit.blocking, [])
  assert.deepEqual(audit.counts, { info: 1, low: 1, moderate: 1, high: 0, critical: 0 })
})

test("rejects an audit whose findings have been filtered out", () => {
  const report = JSON.parse(auditResult([{ ...advisory, severity: "low" }]).stdout)
  report.advisories = {}
  assert.throws(() => evaluateAudit({ status: 0, stdout: JSON.stringify(report) }))
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
    auditResult([{ ...advisory, findings: [] }]),
    auditResult([{ ...advisory, github_advisory_id: undefined }]),
    auditResult([{ ...advisory, module_name: undefined }]),
  ]) {
    assert.throws(() => evaluateAudit(result))
  }
})
