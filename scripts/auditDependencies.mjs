import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { load as loadYaml } from "js-yaml"

const root = fileURLToPath(new URL("../", import.meta.url))
const bracesAdvisory = "GHSA-vfj7-8cjw-p6xm"
const bracesPackage = "braces@3.0.3"
const bracesPatchPath = "patches/braces@3.0.3.patch"
const bracesPatchHash = "ddeca82af6f30abb5c2e545320680269695f8d543891a32a078029087b433a35"
const severities = ["info", "low", "moderate", "high", "critical"]

export function assertBracesPatch(workspace, lockfile, patchHash) {
  assert.equal(workspace.patchedDependencies?.[bracesPackage], bracesPatchPath)
  assert.equal(patchHash, bracesPatchHash, "The reviewed braces patch has changed")
  assert.equal(lockfile.patchedDependencies?.[bracesPackage], bracesPatchHash)
  assert.deepEqual(
    Object.keys(lockfile.packages ?? {}).filter((name) => name.startsWith("braces@")),
    [bracesPackage],
    "The audit mitigation only covers braces@3.0.3",
  )
  assert.deepEqual(
    Object.keys(lockfile.snapshots ?? {}).filter((name) => name.startsWith("braces@")),
    [`${bracesPackage}(patch_hash=${bracesPatchHash})`],
    "Every locked braces instance must use the reviewed patch",
  )
}

function verifyInstalledBracesPatch() {
  const workspace = loadYaml(readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8"))
  const lockfile = loadYaml(readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8"))
  const patchHash = createHash("sha256")
    .update(readFileSync(resolve(root, bracesPatchPath)))
    .digest("hex")
  assertBracesPatch(workspace, lockfile, patchHash)
  const result = spawnSync(process.execPath, [resolve(root, "scripts/checkBracesSecurity.cjs")], {
    cwd: root,
    stdio: "inherit",
    timeout: 30000,
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, "The installed braces patch failed its security regression")
}

export function evaluateAudit(result, verifyPatch) {
  assert.ifError(result.error)
  assert(
    result.status === 0 || result.status === 1,
    `Dependency audit did not complete: ${result.stderr ?? result.signal ?? result.status}`,
  )
  const report = JSON.parse(result.stdout)
  assert(report && typeof report === "object" && !report.error, "Invalid dependency audit report")
  assert(
    report.advisories && typeof report.advisories === "object" && !Array.isArray(report.advisories),
    "Missing dependency advisories",
  )
  assert(report.metadata?.vulnerabilities, "Missing dependency audit totals")
  const counts = Object.fromEntries(severities.map((severity) => [severity, 0]))
  const blocking = []
  const mitigated = []
  for (const advisory of Object.values(report.advisories)) {
    assert(advisory && severities.includes(advisory.severity), "Invalid advisory severity")
    assert.equal(typeof advisory.github_advisory_id, "string", "Missing advisory identity")
    assert.equal(typeof advisory.module_name, "string", "Missing advisory package")
    assert(
      Array.isArray(advisory.findings) && advisory.findings.length,
      "Missing advisory findings",
    )
    counts[advisory.severity] += 1
    if (advisory.severity !== "high" && advisory.severity !== "critical") continue
    if (
      advisory.github_advisory_id === bracesAdvisory &&
      advisory.module_name === "braces" &&
      advisory.findings.every((finding) => finding.version === "3.0.3")
    ) {
      verifyPatch()
      mitigated.push(advisory)
    } else {
      blocking.push(advisory)
    }
  }
  for (const severity of severities) {
    assert.equal(
      report.metadata.vulnerabilities[severity],
      counts[severity],
      `Incomplete ${severity} advisory report`,
    )
  }
  assert(
    result.status === 0 || counts.high + counts.critical > 0,
    "Audit failed without a matching high or critical advisory",
  )
  return { blocking, mitigated, counts }
}

function main() {
  assert(process.env.npm_execpath, "Run this check with pnpm audit:dependencies")
  const result = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "--config.registry=https://registry.npmjs.org/",
      "audit",
      "--audit-level",
      "high",
      "--json",
    ],
    { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
  )
  const audit = evaluateAudit(result, verifyInstalledBracesPatch)
  console.log("Registry advisory totals:", audit.counts)
  for (const advisory of audit.mitigated) {
    console.log(
      `${advisory.github_advisory_id}: local braces patch and installed behavior verified`,
    )
  }
  for (const advisory of audit.blocking) {
    console.error(`${advisory.severity}: ${advisory.github_advisory_id} ${advisory.module_name}`)
  }
  if (audit.blocking.length) process.exitCode = 1
  else
    console.log(
      `Dependency audit passed with ${audit.mitigated.length} verified local mitigation(s)`,
    )
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
