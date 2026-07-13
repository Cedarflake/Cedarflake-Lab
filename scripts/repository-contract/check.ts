import process from "node:process"

import { validateRepositoryContract } from "./repositoryContract.ts"

try {
  const result = await validateRepositoryContract(process.cwd())

  if (result.violations.length > 0) {
    console.error(
      `Repository contract failed with ${result.violations.length} violations:`,
    )

    for (const violation of result.violations) {
      console.error(
        `- ${violation.code} ${violation.path}: ${violation.message}`,
      )
    }

    process.exitCode = 1
  } else {
    const summary = result.summary

    console.log(
      `Validated ${summary.workflowCount} workflows, ${summary.testProjectCount} test projects (${summary.testFileCount} files), ${summary.dependencyProjectCount} dependency projects, and ${summary.auditEntryCount} audit entries.`,
    )
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  console.error(`Repository contract could not run: ${message}`)
  process.exitCode = 1
}
