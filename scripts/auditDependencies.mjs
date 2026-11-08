import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const severities = ["info", "low", "moderate", "high", "critical"]

export function evaluateAudit(result) {
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
    blocking.push(advisory)
  }
  for (const severity of severities) {
    assert.equal(
      report.metadata.vulnerabilities[severity],
      counts[severity],
      `Incomplete ${severity} advisory report`,
    )
  }
  assert(
    result.status === 0 || severities.some((severity) => counts[severity] > 0),
    "Audit failed without a matching advisory",
  )
  return { blocking, counts }
}

function main() {
  assert(process.env.npm_execpath, "Run this check with pnpm audit:dependencies")
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, "--config.registry=https://registry.npmjs.org/", "audit", "--json"],
    { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
  )
  const audit = evaluateAudit(result)
  console.log("Registry advisory totals:", audit.counts)
  for (const advisory of audit.blocking) {
    console.error(`${advisory.severity}: ${advisory.github_advisory_id} ${advisory.module_name}`)
  }
  if (audit.blocking.length) process.exitCode = 1
  else console.log("Dependency audit passed")
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
