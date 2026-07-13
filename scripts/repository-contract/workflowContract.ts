import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { CORE_SCHEMA, load } from "js-yaml"

import type {
  ContractSectionResult,
  ContractViolation,
  WorkflowContractSummary,
} from "./types.ts"

type WorkflowScope = "group" | "project" | "repo"
type PathFilterKey = "paths" | "paths-ignore"
type PathFilterTrigger = "pull_request" | "push"

const workflowDirectory = ".github/workflows"
const workflowFilePattern = /\.ya?ml$/i
const workflowFilenamePattern =
  /^(repo|group|project)-([a-z0-9]+(?:-[a-z0-9]+)*)-(ci|security|release|maintenance)\.yml$/
const workflowScopePattern = /^(repo|group|project)-/
const pathFilterKeys: readonly PathFilterKey[] = ["paths", "paths-ignore"]
const pathFilterTriggers: readonly PathFilterTrigger[] = [
  "pull_request",
  "push",
]
const scopePrefixes: Record<WorkflowScope, string> = {
  group: "[Group]",
  project: "[Project]",
  repo: "[Repo]",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isWorkflowScope(value: string): value is WorkflowScope {
  return value === "group" || value === "project" || value === "repo"
}

function extractWorkflowScope(filename: string): WorkflowScope | undefined {
  const scope = workflowScopePattern.exec(filename)?.[1]

  return typeof scope === "string" && isWorkflowScope(scope) ? scope : undefined
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function addViolation(
  violations: ContractViolation[],
  violation: ContractViolation,
): void {
  violations.push(violation)
}

function findPathPatternProblem(pattern: string): string | undefined {
  if (pattern.length === 0) {
    return "must not be empty"
  }

  if (pattern !== pattern.trim()) {
    return "must not contain leading or trailing whitespace"
  }

  if (pattern.includes("${{")) {
    return "must be static and cannot contain a GitHub expression"
  }

  if (/[\u0000-\u001f\u007f]/u.test(pattern)) {
    return "must not contain control characters"
  }

  const repositoryPattern = pattern.startsWith("!") ? pattern.slice(1) : pattern

  if (repositoryPattern.length === 0) {
    return "must contain a repository-relative pattern after negation"
  }

  if (
    repositoryPattern.startsWith("/") ||
    /^[A-Za-z]:[\\/]/u.test(repositoryPattern)
  ) {
    return "must be repository-relative"
  }

  if (repositoryPattern.startsWith("./")) {
    return "must not start with ./"
  }

  const segments = repositoryPattern.split("/")

  if (segments.some((segment) => segment.length === 0)) {
    return "must not contain empty path segments"
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return "must not contain . or .. path segments"
  }

  for (let index = 0; index < repositoryPattern.length; index += 1) {
    if (repositoryPattern[index] !== "\\") {
      continue
    }

    const escapedCharacter = repositoryPattern[index + 1]

    if (
      escapedCharacter === undefined ||
      !"*?[]!\\".includes(escapedCharacter)
    ) {
      return "must use forward slashes; backslashes are only valid glob escapes"
    }

    index += 1
  }

  return undefined
}

function validatePathList(
  value: unknown,
  trigger: PathFilterTrigger,
  filterKey: PathFilterKey,
  workflowPath: string,
  violations: ContractViolation[],
): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    addViolation(violations, {
      code: "WORKFLOW_SCHEMA_INVALID",
      message: `${trigger}.${filterKey} must be a non-empty string array`,
      path: workflowPath,
    })

    return undefined
  }

  const validPatterns: string[] = []

  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      addViolation(violations, {
        code: "WORKFLOW_SCHEMA_INVALID",
        message: `${trigger}.${filterKey}[${index}] must be a string`,
        path: workflowPath,
      })

      return
    }

    const problem = findPathPatternProblem(entry)

    if (problem !== undefined) {
      addViolation(violations, {
        code: "WORKFLOW_SCHEMA_INVALID",
        message: `${trigger}.${filterKey}[${index}] ${problem}`,
        path: workflowPath,
      })

      return
    }

    validPatterns.push(entry)
  })

  return validPatterns
}

function validatePathFilteredTrigger(
  trigger: PathFilterTrigger,
  configuration: unknown,
  workflowPath: string,
  violations: ContractViolation[],
): void {
  if (configuration === null) {
    return
  }

  if (!isRecord(configuration)) {
    addViolation(violations, {
      code: "WORKFLOW_SCHEMA_INVALID",
      message: `${trigger} must be empty or a mapping`,
      path: workflowPath,
    })

    return
  }

  const hasPaths = Object.hasOwn(configuration, "paths")
  const hasPathsIgnore = Object.hasOwn(configuration, "paths-ignore")

  if (hasPaths && hasPathsIgnore) {
    addViolation(violations, {
      code: "WORKFLOW_SCHEMA_INVALID",
      message: `${trigger} cannot define both paths and paths-ignore`,
      path: workflowPath,
    })
  }

  for (const filterKey of pathFilterKeys) {
    if (!Object.hasOwn(configuration, filterKey)) {
      continue
    }

    const patterns = validatePathList(
      configuration[filterKey],
      trigger,
      filterKey,
      workflowPath,
      violations,
    )

    if (
      filterKey === "paths" &&
      (patterns === undefined || !patterns.includes(workflowPath))
    ) {
      addViolation(violations, {
        code: "WORKFLOW_SELF_PATH_MISSING",
        message: `${trigger}.paths must include ${workflowPath}`,
        path: workflowPath,
      })
    }
  }
}

function validateWorkflowTriggers(
  value: unknown,
  workflowPath: string,
  violations: ContractViolation[],
): void {
  if (isNonEmptyString(value)) {
    return
  }

  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isNonEmptyString)) {
      return
    }

    addViolation(violations, {
      code: "WORKFLOW_SCHEMA_INVALID",
      message: "on must be a non-empty event name, event array, or mapping",
      path: workflowPath,
    })

    return
  }

  if (!isRecord(value) || Object.keys(value).length === 0) {
    addViolation(violations, {
      code: "WORKFLOW_SCHEMA_INVALID",
      message: "on must be a non-empty event name, event array, or mapping",
      path: workflowPath,
    })

    return
  }

  for (const trigger of pathFilterTriggers) {
    if (Object.hasOwn(value, trigger)) {
      validatePathFilteredTrigger(
        trigger,
        value[trigger],
        workflowPath,
        violations,
      )
    }
  }
}

function validateWorkflowDocument(
  document: unknown,
  scope: WorkflowScope | undefined,
  workflowPath: string,
  violations: ContractViolation[],
): void {
  if (!isRecord(document)) {
    addViolation(violations, {
      code: "WORKFLOW_SCHEMA_INVALID",
      message: "workflow must be a YAML mapping",
      path: workflowPath,
    })

    return
  }

  if (!isNonEmptyString(document.name)) {
    addViolation(violations, {
      code: "WORKFLOW_SCHEMA_INVALID",
      message: "workflow name must be a non-empty string",
      path: workflowPath,
    })
  } else if (
    scope !== undefined &&
    !document.name.startsWith(`${scopePrefixes[scope]} `)
  ) {
    addViolation(violations, {
      code: "WORKFLOW_NAME_PREFIX_INVALID",
      message: `workflow name must begin with ${scopePrefixes[scope]}`,
      path: workflowPath,
    })
  }

  validateWorkflowTriggers(document.on, workflowPath, violations)

  if (!isRecord(document.jobs) || Object.keys(document.jobs).length === 0) {
    addViolation(violations, {
      code: "WORKFLOW_SCHEMA_INVALID",
      message: "workflow jobs must be a non-empty mapping",
      path: workflowPath,
    })

    return
  }

  for (const [jobName, job] of Object.entries(document.jobs)) {
    if (jobName.trim().length === 0 || !isRecord(job)) {
      addViolation(violations, {
        code: "WORKFLOW_SCHEMA_INVALID",
        message: "each workflow job must have a name and mapping definition",
        path: workflowPath,
      })
    }
  }
}

export async function validateWorkflowContract(
  repositoryRoot: string,
): Promise<ContractSectionResult<WorkflowContractSummary>> {
  const violations: ContractViolation[] = []
  const workflowsPath = join(repositoryRoot, ".github", "workflows")
  let workflowFilenames: string[]

  try {
    const entries = await readdir(workflowsPath, { withFileTypes: true })
    workflowFilenames = entries
      .filter((entry) => entry.isFile() && workflowFilePattern.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"))
  } catch (error) {
    addViolation(violations, {
      code: "WORKFLOW_SCHEMA_INVALID",
      message: `cannot read workflow directory: ${describeError(error)}`,
      path: workflowDirectory,
    })

    return {
      summary: { workflowCount: 0 },
      violations,
    }
  }

  for (const filename of workflowFilenames) {
    const workflowPath = `${workflowDirectory}/${filename}`
    const scope = extractWorkflowScope(filename)

    if (!workflowFilenamePattern.test(filename)) {
      addViolation(violations, {
        code: "WORKFLOW_FILENAME_INVALID",
        message: "workflow filename must match <scope>-<target>-<purpose>.yml",
        path: workflowPath,
      })
    }

    let source: string

    try {
      source = await readFile(join(workflowsPath, filename), "utf8")
    } catch (error) {
      addViolation(violations, {
        code: "WORKFLOW_SCHEMA_INVALID",
        message: `cannot read workflow: ${describeError(error)}`,
        path: workflowPath,
      })

      continue
    }

    let document: unknown

    try {
      document = load(source, {
        filename: workflowPath,
        maxAliases: 100,
        maxDepth: 100,
        schema: CORE_SCHEMA,
      })
    } catch (error) {
      addViolation(violations, {
        code: "WORKFLOW_SCHEMA_INVALID",
        message: `cannot parse workflow YAML: ${describeError(error)}`,
        path: workflowPath,
      })

      continue
    }

    validateWorkflowDocument(document, scope, workflowPath, violations)
  }

  return {
    summary: { workflowCount: workflowFilenames.length },
    violations,
  }
}
