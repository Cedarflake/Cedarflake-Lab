import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import { CORE_SCHEMA, load as parseYaml } from "js-yaml"
import { parse as parseToml } from "smol-toml"

import type {
  ContractSectionResult,
  ContractViolation,
  WorkbenchContractSummary,
} from "./types.ts"

const WORKFLOW_PATH = ".github/workflows/group-workbench-python-ci.yml"
const PROJECT_PATH_PATTERN = /^workbench\/[^/]+\/[^/]+$/
const TEST_FILE_PATTERN = /^test_.*\.py$/
const REQUIREMENT_OPTION_PATTERN = /^(?:--(?:extra-index-url|find-links|index-url|no-binary|no-index|only-binary|prefer-binary|pre|require-hashes|trusted-host|use-feature))(?:\s|=|$)/

interface UnknownRecord {
  [key: string]: unknown
}

interface WorkbenchProject {
  absolutePath: string
  dependencySource: "pyproject" | "requirements" | null
  hasEffectiveRequirements: boolean
  hasPyproject: boolean
  hasUvLock: boolean
  path: string
  testFiles: string[]
}

interface Registration {
  command: string | null
  displayPath: string
  normalizedPath: string | null
}

interface AuditRegistration extends Registration {
  arguments: string | null
}

interface WorkflowRegistrations {
  auditEntryCount: number
  auditRegistrations: AuditRegistration[]
  testRegistrations: Registration[]
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1
  }

  if (left > right) {
    return 1
  }

  return 0
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split(/\r?\n/, 1)[0]?.trim() || "Unknown error"
}

function sortViolations(violations: ContractViolation[]): ContractViolation[] {
  return violations.sort((left, right) => (
    compareText(left.path, right.path)
    || compareText(left.code, right.code)
    || compareText(left.message, right.message)
  ))
}

async function readDirectory(path: string) {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch (error) {
    if (
      isRecord(error)
      && (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return []
    }

    throw error
  }
}

function stripRequirementComment(line: string): string {
  const commentIndex = line.search(/\s+#/)
  return (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trim()
}

function getEffectiveRequirementLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map(stripRequirementComment)
    .filter((line) => (
      line.length > 0
      && !line.startsWith("#")
      && !REQUIREMENT_OPTION_PATTERN.test(line)
    ))
}

function getPyprojectDependencyState(manifest: unknown): boolean {
  if (!isRecord(manifest)) {
    throw new TypeError("TOML root must be a table")
  }

  const project = manifest.project

  if (project === undefined) {
    return false
  }

  if (!isRecord(project)) {
    throw new TypeError("[project] must be a table")
  }

  const dependencies = project.dependencies

  if (dependencies === undefined) {
    return false
  }

  if (
    !Array.isArray(dependencies)
    || dependencies.some((dependency) => (
      typeof dependency !== "string" || dependency.trim().length === 0
    ))
  ) {
    throw new TypeError("project.dependencies must be an array of non-empty strings")
  }

  return dependencies.length > 0
}

async function discoverNestedTests(
  directory: string,
  relativeDirectory = "",
): Promise<string[]> {
  const testFiles: string[] = []
  const entries = (await readDirectory(directory))
    .sort((left, right) => compareText(left.name, right.name))

  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name
    const absolutePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      testFiles.push(...await discoverNestedTests(absolutePath, relativePath))
      continue
    }

    if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      testFiles.push(relativePath)
    }
  }

  return testFiles
}

async function discoverProjectTests(projectPath: string): Promise<string[]> {
  const entries = await readDirectory(projectPath)
  const rootTests = entries
    .filter((entry) => entry.isFile() && TEST_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
  const testsDirectory = entries.find((entry) => (
    entry.isDirectory() && entry.name === "tests"
  ))
  const nestedTests = testsDirectory
    ? await discoverNestedTests(join(projectPath, "tests"), "tests")
    : []

  return [...rootTests, ...nestedTests].sort(compareText)
}

async function discoverWorkbenchProjects(
  repositoryRoot: string,
  violations: ContractViolation[],
): Promise<WorkbenchProject[]> {
  const projects: WorkbenchProject[] = []
  const workbenchPath = join(repositoryRoot, "workbench")
  const categories = (await readDirectory(workbenchPath))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => compareText(left.name, right.name))

  for (const category of categories) {
    const categoryPath = join(workbenchPath, category.name)
    const projectEntries = (await readDirectory(categoryPath))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => compareText(left.name, right.name))

    for (const projectEntry of projectEntries) {
      const projectPath = `workbench/${category.name}/${projectEntry.name}`
      const absolutePath = join(categoryPath, projectEntry.name)
      const entries = await readDirectory(absolutePath)
      const names = new Set(entries.map((entry) => entry.name))
      const hasPyproject = names.has("pyproject.toml")
      const hasUvLock = names.has("uv.lock")
      const hasRequirements = names.has("requirements.txt")
      let hasPyprojectDependencies = false
      let hasEffectiveRequirements = false

      if (hasPyproject) {
        const manifestPath = `${projectPath}/pyproject.toml`

        try {
          const source = await readFile(join(absolutePath, "pyproject.toml"), "utf8")
          hasPyprojectDependencies = getPyprojectDependencyState(parseToml(source))
        } catch (error) {
          violations.push({
            code: "WORKBENCH_MANIFEST_INVALID",
            message: `Invalid pyproject.toml: ${errorMessage(error)}`,
            path: manifestPath,
          })
        }
      }

      if (hasRequirements) {
        const manifestPath = `${projectPath}/requirements.txt`

        try {
          const source = await readFile(join(absolutePath, "requirements.txt"), "utf8")
          hasEffectiveRequirements = getEffectiveRequirementLines(source).length > 0
        } catch (error) {
          violations.push({
            code: "WORKBENCH_MANIFEST_INVALID",
            message: `Invalid requirements.txt: ${errorMessage(error)}`,
            path: manifestPath,
          })
        }
      }

      if (hasUvLock && !hasPyproject) {
        violations.push({
          code: "WORKBENCH_UV_LOCK_ORPHANED",
          message: "uv.lock requires a pyproject.toml in the same project",
          path: `${projectPath}/uv.lock`,
        })
      }

      projects.push({
        absolutePath,
        dependencySource: hasPyprojectDependencies
          ? "pyproject"
          : hasEffectiveRequirements
            ? "requirements"
            : null,
        hasEffectiveRequirements,
        hasPyproject,
        hasUvLock,
        path: projectPath,
        testFiles: await discoverProjectTests(absolutePath),
      })
    }
  }

  return projects
}

function normalizeRegistrationPath(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/")

  if (
    normalized.length === 0
    || /[\u0000-\u001f\u007f]/u.test(normalized)
    || normalized.startsWith("/")
    || /^[A-Za-z]:\//.test(normalized)
    || /[${}]/.test(normalized)
  ) {
    return null
  }

  const segments = normalized.split("/")

  if (
    segments.some((segment) => (
      segment.length === 0 || segment === "." || segment === ".."
    ))
    || !PROJECT_PATH_PATTERN.test(normalized)
  ) {
    return null
  }

  return normalized
}

function createRegistration(
  rawPath: string,
  command: string | null,
): Registration {
  const displayPath = rawPath.trim().replaceAll("\\", "/") || "<empty>"

  return {
    command,
    displayPath,
    normalizedPath: normalizeRegistrationPath(rawPath),
  }
}

function addWorkflowSchemaViolation(
  violations: ContractViolation[],
  message: string,
): void {
  violations.push({
    code: "WORKFLOW_SCHEMA_INVALID",
    message,
    path: WORKFLOW_PATH,
  })
}

function extractTestRegistrations(
  jobs: UnknownRecord,
  violations: ContractViolation[],
): Registration[] | null {
  const testJob = jobs.test

  if (testJob === undefined) {
    return []
  }

  if (!isRecord(testJob)) {
    addWorkflowSchemaViolation(violations, "jobs.test must be a mapping")
    return null
  }

  const steps = testJob.steps

  if (steps === undefined) {
    return []
  }

  if (!Array.isArray(steps)) {
    addWorkflowSchemaViolation(violations, "jobs.test.steps must be an array")
    return null
  }

  const registrations: Registration[] = []

  for (const [index, step] of steps.entries()) {
    if (!isRecord(step)) {
      addWorkflowSchemaViolation(
        violations,
        `jobs.test.steps[${index}] must be a mapping`,
      )
      continue
    }

    const workingDirectory = step["working-directory"]

    if (workingDirectory === undefined) {
      continue
    }

    if (typeof workingDirectory !== "string") {
      addWorkflowSchemaViolation(
        violations,
        `jobs.test.steps[${index}].working-directory must be a string`,
      )
      continue
    }

    const command = step.run

    if (typeof command !== "string") {
      addWorkflowSchemaViolation(
        violations,
        `jobs.test.steps[${index}].run must be a string`,
      )
      continue
    }

    registrations.push(createRegistration(workingDirectory, command))
  }

  return registrations
}

function extractAuditRegistrations(
  jobs: UnknownRecord,
  violations: ContractViolation[],
): { entryCount: number; registrations: AuditRegistration[] } | null {
  const auditJob = jobs.audit

  if (auditJob === undefined) {
    return { entryCount: 0, registrations: [] }
  }

  if (!isRecord(auditJob)) {
    addWorkflowSchemaViolation(violations, "jobs.audit must be a mapping")
    return null
  }

  const strategy = auditJob.strategy

  if (strategy === undefined) {
    return { entryCount: 0, registrations: [] }
  }

  if (!isRecord(strategy)) {
    addWorkflowSchemaViolation(violations, "jobs.audit.strategy must be a mapping")
    return null
  }

  const matrix = strategy.matrix

  if (matrix === undefined) {
    return { entryCount: 0, registrations: [] }
  }

  if (!isRecord(matrix)) {
    addWorkflowSchemaViolation(violations, "jobs.audit.strategy.matrix must be a mapping")
    return null
  }

  const include = matrix.include

  if (include === undefined) {
    return { entryCount: 0, registrations: [] }
  }

  if (!Array.isArray(include)) {
    addWorkflowSchemaViolation(
      violations,
      "jobs.audit.strategy.matrix.include must be an array",
    )
    return null
  }

  const registrations: AuditRegistration[] = []

  for (const [index, entry] of include.entries()) {
    if (!isRecord(entry)) {
      addWorkflowSchemaViolation(
        violations,
        `jobs.audit.strategy.matrix.include[${index}] must be a mapping`,
      )
      continue
    }

    const directory = entry.directory

    if (typeof directory !== "string") {
      addWorkflowSchemaViolation(
        violations,
        `jobs.audit.strategy.matrix.include[${index}].directory must be a string`,
      )
      continue
    }

    const registration = createRegistration(directory, null)
    registrations.push({
      ...registration,
      arguments: typeof entry.arguments === "string" ? entry.arguments : null,
    })
  }

  return {
    entryCount: include.length,
    registrations,
  }
}

async function readWorkflowRegistrations(
  repositoryRoot: string,
  violations: ContractViolation[],
): Promise<WorkflowRegistrations | null> {
  let source: string

  try {
    source = await readFile(join(repositoryRoot, ...WORKFLOW_PATH.split("/")), "utf8")
  } catch (error) {
    addWorkflowSchemaViolation(
      violations,
      `Unable to read Workbench workflow: ${errorMessage(error)}`,
    )
    return null
  }

  let workflow: unknown

  try {
    workflow = parseYaml(source, {
      filename: WORKFLOW_PATH,
      maxAliases: 100,
      maxDepth: 100,
      schema: CORE_SCHEMA,
    })
  } catch (error) {
    addWorkflowSchemaViolation(
      violations,
      `Invalid Workbench workflow YAML: ${errorMessage(error)}`,
    )
    return null
  }

  if (!isRecord(workflow) || !isRecord(workflow.jobs)) {
    addWorkflowSchemaViolation(violations, "Workbench workflow must define a jobs mapping")
    return null
  }

  const testRegistrations = extractTestRegistrations(workflow.jobs, violations)
  const audit = extractAuditRegistrations(workflow.jobs, violations)

  if (!testRegistrations || !audit) {
    return null
  }

  return {
    auditEntryCount: audit.entryCount,
    auditRegistrations: audit.registrations,
    testRegistrations,
  }
}

function registrationKey(registration: Registration): string {
  return registration.normalizedPath ?? `!invalid:${registration.displayPath}`
}

function groupRegistrations<TRegistration extends Registration>(
  registrations: TRegistration[],
): Map<string, TRegistration[]> {
  const groups = new Map<string, TRegistration[]>()

  for (const registration of registrations) {
    const key = registrationKey(registration)
    const group = groups.get(key) ?? []
    group.push(registration)
    groups.set(key, group)
  }

  return groups
}

function hasCommandOption(command: string, option: string): boolean {
  const escapedOption = option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?:^|\\s)${escapedOption}(?:\\s|$)`).test(command)
}

function hasRequirementsOption(command: string): boolean {
  return /(?:^|\s)--with-requirements(?:=|\s+)(?:["']?\.?[\\/]?requirements\.txt["']?)(?=\s|$)/.test(command)
}

function validateTestRegistrations(
  projects: WorkbenchProject[],
  registrations: Registration[],
  violations: ContractViolation[],
): void {
  const testProjects = new Map(
    projects
      .filter((project) => project.testFiles.length > 0)
      .map((project) => [project.path, project]),
  )
  const groups = groupRegistrations(registrations)

  for (const group of groups.values()) {
    const first = group[0]

    if (!first) {
      continue
    }

    if (group.length > 1) {
      violations.push({
        code: "WORKBENCH_TEST_DUPLICATE",
        message: `Test registration "${first.displayPath}" appears ${group.length} times`,
        path: WORKFLOW_PATH,
      })
    }

    if (!first.normalizedPath || !testProjects.has(first.normalizedPath)) {
      violations.push({
        code: "WORKBENCH_TEST_STALE",
        message: `Test registration "${first.displayPath}" does not match a discovered test project`,
        path: WORKFLOW_PATH,
      })
    }
  }

  for (const project of testProjects.values()) {
    const registrationsForProject = groups.get(project.path)

    if (!registrationsForProject) {
      violations.push({
        code: "WORKBENCH_TEST_MISSING",
        message: `Test project "${project.path}" is not registered in the Workbench workflow`,
        path: project.path,
      })
      continue
    }

    const commands = registrationsForProject
      .map((registration) => registration.command)
      .filter((command): command is string => command !== null)
    const missingOptions: string[] = []

    if (
      project.dependencySource === "requirements"
      && !commands.some(hasRequirementsOption)
    ) {
      missingOptions.push("--with-requirements requirements.txt")
    }

    if (
      project.hasPyproject
      && project.hasUvLock
      && !commands.some((command) => hasCommandOption(command, "--frozen"))
    ) {
      missingOptions.push("--frozen")
    }

    if (missingOptions.length > 0) {
      violations.push({
        code: "WORKBENCH_TEST_DEPENDENCIES_MISSING",
        message: `Test command for "${project.path}" must include ${missingOptions.join(" and ")}`,
        path: project.path,
      })
    }
  }
}

function validateAuditRegistrations(
  projects: WorkbenchProject[],
  registrations: AuditRegistration[],
  violations: ContractViolation[],
): void {
  const dependencyProjects = new Map(
    projects
      .filter((project) => project.dependencySource !== null)
      .map((project) => [project.path, project]),
  )
  const groups = groupRegistrations(registrations)

  for (const group of groups.values()) {
    const first = group[0]

    if (!first) {
      continue
    }

    if (group.length > 1) {
      violations.push({
        code: "WORKBENCH_AUDIT_DUPLICATE",
        message: `Audit registration "${first.displayPath}" appears ${group.length} times`,
        path: WORKFLOW_PATH,
      })
    }

    if (!first.normalizedPath || !dependencyProjects.has(first.normalizedPath)) {
      violations.push({
        code: "WORKBENCH_AUDIT_STALE",
        message: `Audit registration "${first.displayPath}" does not match a discovered dependency project`,
        path: WORKFLOW_PATH,
      })
    }
  }

  for (const project of dependencyProjects.values()) {
    const registrationsForProject = groups.get(project.path)

    if (!registrationsForProject) {
      violations.push({
        code: "WORKBENCH_AUDIT_MISSING",
        message: `Dependency project "${project.path}" is not registered in the audit matrix`,
        path: project.path,
      })
      continue
    }

    const expectedArguments = project.dependencySource === "pyproject"
      ? "."
      : "-r requirements.txt"

    const hasInvalidArguments = registrationsForProject.some((registration) => {
      const actualArguments = registration.arguments
        ?.trim()
        .replace(/\s+/g, " ") ?? ""

      return actualArguments !== expectedArguments
    })

    if (hasInvalidArguments) {
      violations.push({
        code: "WORKBENCH_AUDIT_ARGUMENTS_INVALID",
        message: `Audit registration for "${project.path}" must use arguments "${expectedArguments}"`,
        path: WORKFLOW_PATH,
      })
    }
  }
}

export async function validateWorkbenchContract(
  repositoryRoot: string,
): Promise<ContractSectionResult<WorkbenchContractSummary>> {
  if (repositoryRoot.trim().length === 0 || repositoryRoot.includes("\0")) {
    throw new TypeError("repositoryRoot must be a valid non-empty path")
  }

  const resolvedRepositoryRoot = resolve(repositoryRoot)
  const violations: ContractViolation[] = []
  const projects = await discoverWorkbenchProjects(
    resolvedRepositoryRoot,
    violations,
  )
  const workflow = await readWorkflowRegistrations(
    resolvedRepositoryRoot,
    violations,
  )

  if (workflow) {
    validateTestRegistrations(
      projects,
      workflow.testRegistrations,
      violations,
    )
    validateAuditRegistrations(
      projects,
      workflow.auditRegistrations,
      violations,
    )
  }

  return {
    summary: {
      auditEntryCount: workflow?.auditEntryCount ?? 0,
      dependencyProjectCount: projects.filter((project) => (
        project.dependencySource !== null
      )).length,
      testFileCount: projects.reduce((count, project) => (
        count + project.testFiles.length
      ), 0),
      testProjectCount: projects.filter((project) => (
        project.testFiles.length > 0
      )).length,
    },
    violations: sortViolations(violations),
  }
}
