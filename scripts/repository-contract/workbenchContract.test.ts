import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"

import { validateWorkbenchContract } from "./workbenchContract.ts"

interface TestRegistration {
  command: string
  directory: string
}

interface AuditRegistration {
  arguments: string
  directory: string
}

interface WorkflowOptions {
  audit?: AuditRegistration[]
  tests?: TestRegistration[]
}

async function writeRepositoryFile(
  repositoryRoot: string,
  path: string,
  source = "",
): Promise<void> {
  const filePath = join(repositoryRoot, ...path.split("/"))
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, source, "utf8")
}

function yamlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function createWorkflow(options: WorkflowOptions = {}): string {
  const tests = options.tests ?? []
  const audit = options.audit ?? []
  const testSteps = tests.length === 0
    ? "    steps: []"
    : [
        "    steps:",
        ...tests.flatMap((registration) => [
          `      - working-directory: ${yamlString(registration.directory)}`,
          `        run: ${yamlString(registration.command)}`,
        ]),
      ].join("\n")
  const auditEntries = audit.length === 0
    ? "        include: []"
    : [
        "        include:",
        ...audit.flatMap((registration) => [
          `          - directory: ${yamlString(registration.directory)}`,
          `            arguments: ${yamlString(registration.arguments)}`,
        ]),
      ].join("\n")

  return [
    "jobs:",
    "  test:",
    testSteps,
    "  audit:",
    "    strategy:",
    "      matrix:",
    auditEntries,
    "",
  ].join("\n")
}

async function writeWorkflow(
  repositoryRoot: string,
  options: WorkflowOptions = {},
): Promise<void> {
  await writeRepositoryFile(
    repositoryRoot,
    ".github/workflows/group-workbench-python-ci.yml",
    createWorkflow(options),
  )
}

async function withRepository(
  callback: (repositoryRoot: string) => Promise<void>,
): Promise<void> {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), "cedarflake-workbench-contract-"),
  )

  try {
    await callback(repositoryRoot)
  } finally {
    await rm(repositoryRoot, { force: true, recursive: true })
  }
}

function violationCodes(result: Awaited<ReturnType<typeof validateWorkbenchContract>>) {
  return result.violations.map((violation) => violation.code)
}

test("accepts complete Workbench dependency, test, and audit registrations", async () => {
  await withRepository(async (repositoryRoot) => {
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/locked/pyproject.toml",
      "[project]\ndependencies = [\"httpx>=0.28\"]\n",
    )
    await writeRepositoryFile(repositoryRoot, "workbench/tools/locked/uv.lock")
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/locked/tests/test_locked.py",
    )
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/requirements/requirements.txt",
      "# runtime\n\nrequests>=2 # HTTP client\n--index-url https://example.invalid/simple\n",
    )
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/requirements/test_requirements.py",
    )
    await writeWorkflow(repositoryRoot, {
      tests: [
        {
          command: "uv run --frozen python -m unittest discover -s tests",
          directory: "workbench/tools/locked",
        },
        {
          command: "uv run --no-project --with-requirements requirements.txt python -m unittest test_requirements.py",
          directory: "workbench/tools/requirements",
        },
      ],
      audit: [
        { arguments: ".", directory: "workbench/tools/locked" },
        {
          arguments: "-r requirements.txt",
          directory: "workbench/tools/requirements",
        },
      ],
    })

    const result = await validateWorkbenchContract(repositoryRoot)

    assert.deepEqual(result, {
      summary: {
        auditEntryCount: 2,
        dependencyProjectCount: 2,
        testFileCount: 2,
        testProjectCount: 2,
      },
      violations: [],
    })
  })
})

test("reports missing, duplicate, and stale test and audit registrations", async () => {
  await withRepository(async (repositoryRoot) => {
    for (const slug of ["alpha", "beta"]) {
      await writeRepositoryFile(
        repositoryRoot,
        `workbench/tools/${slug}/requirements.txt`,
        "requests\n",
      )
      await writeRepositoryFile(
        repositoryRoot,
        `workbench/tools/${slug}/tests/test_${slug}.py`,
      )
    }

    const alphaTest = {
      command: "uv run --no-project --with-requirements requirements.txt python -m unittest",
      directory: "workbench/tools/alpha",
    }
    const alphaAudit = {
      arguments: "-r requirements.txt",
      directory: "workbench/tools/alpha",
    }
    await writeWorkflow(repositoryRoot, {
      tests: [
        alphaTest,
        alphaTest,
        { command: "python -m unittest", directory: "workbench/tools/ghost" },
      ],
      audit: [
        alphaAudit,
        alphaAudit,
        { arguments: ".", directory: "workbench/tools/ghost" },
      ],
    })

    const result = await validateWorkbenchContract(repositoryRoot)
    const codes = violationCodes(result)

    assert.equal(codes.filter((code) => code === "WORKBENCH_TEST_MISSING").length, 1)
    assert.equal(codes.filter((code) => code === "WORKBENCH_TEST_DUPLICATE").length, 1)
    assert.equal(codes.filter((code) => code === "WORKBENCH_TEST_STALE").length, 1)
    assert.equal(codes.filter((code) => code === "WORKBENCH_AUDIT_MISSING").length, 1)
    assert.equal(codes.filter((code) => code === "WORKBENCH_AUDIT_DUPLICATE").length, 1)
    assert.equal(codes.filter((code) => code === "WORKBENCH_AUDIT_STALE").length, 1)
    assert.equal(result.summary.auditEntryCount, 3)

    const diagnosticOrder = result.violations.map((violation) => (
      `${violation.path}|${violation.code}|${violation.message}`
    ))
    assert.deepEqual(diagnosticOrder, [...diagnosticOrder].sort())
  })
})

test("validates audit arguments against the canonical dependency manifest", async () => {
  await withRepository(async (repositoryRoot) => {
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/locked/pyproject.toml",
      "[project]\ndependencies = [\"httpx\"]\n",
    )
    await writeRepositoryFile(repositoryRoot, "workbench/tools/locked/uv.lock")
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/locked/tests/test_locked.py",
    )
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/requirements/requirements.txt",
      "requests\n",
    )
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/requirements/tests/test_requirements.py",
    )
    await writeWorkflow(repositoryRoot, {
      tests: [
        {
          command: "uv run --frozen python -m unittest",
          directory: "workbench/tools/locked",
        },
        {
          command: "uv run --with-requirements requirements.txt python -m unittest",
          directory: "workbench/tools/requirements",
        },
      ],
      audit: [
        {
          arguments: "-r requirements.txt",
          directory: "workbench/tools/locked",
        },
        { arguments: ".", directory: "workbench/tools/requirements" },
      ],
    })

    const result = await validateWorkbenchContract(repositoryRoot)

    assert.deepEqual(
      violationCodes(result),
      [
        "WORKBENCH_AUDIT_ARGUMENTS_INVALID",
        "WORKBENCH_AUDIT_ARGUMENTS_INVALID",
      ],
    )
  })
})

test("discovers root and nested tests while ignoring non-test Python files", async () => {
  await withRepository(async (repositoryRoot) => {
    await writeRepositoryFile(repositoryRoot, "workbench/media/sample/test_root.py")
    await writeRepositoryFile(repositoryRoot, "workbench/media/sample/tests/test_top.py")
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/media/sample/tests/unit/test_nested.py",
    )
    await writeRepositoryFile(repositoryRoot, "workbench/media/sample/tests/helper.py")
    await writeRepositoryFile(repositoryRoot, "workbench/media/sample/other/test_ignored.py")
    await writeWorkflow(repositoryRoot, {
      tests: [
        {
          command: "uv run --no-project python -m unittest",
          directory: "workbench/media/sample",
        },
      ],
    })

    const result = await validateWorkbenchContract(repositoryRoot)

    assert.deepEqual(result, {
      summary: {
        auditEntryCount: 0,
        dependencyProjectCount: 0,
        testFileCount: 3,
        testProjectCount: 1,
      },
      violations: [],
    })
  })
})

test("requires declared dependencies in test commands", async () => {
  await withRepository(async (repositoryRoot) => {
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/requirements/requirements.txt",
      "requests\n",
    )
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/requirements/tests/test_requirements.py",
    )
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/locked/pyproject.toml",
      "[project]\ndependencies = [\"httpx\"]\n",
    )
    await writeRepositoryFile(repositoryRoot, "workbench/tools/locked/uv.lock")
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/locked/tests/test_locked.py",
    )
    await writeWorkflow(repositoryRoot, {
      tests: [
        { command: "uv run --no-project python -m unittest", directory: "workbench/tools/requirements" },
        { command: "uv run python -m unittest", directory: "workbench/tools/locked" },
      ],
      audit: [
        {
          arguments: "-r requirements.txt",
          directory: "workbench/tools/requirements",
        },
        { arguments: ".", directory: "workbench/tools/locked" },
      ],
    })

    const result = await validateWorkbenchContract(repositoryRoot)

    assert.deepEqual(
      violationCodes(result),
      [
        "WORKBENCH_TEST_DEPENDENCIES_MISSING",
        "WORKBENCH_TEST_DEPENDENCIES_MISSING",
      ],
    )
    assert.match(result.violations[0]?.message ?? "", /--frozen|--with-requirements/)
    assert.match(result.violations[1]?.message ?? "", /--frozen|--with-requirements/)
  })
})

test("uses pyproject as the canonical dependency source for dual manifests", async () => {
  await withRepository(async (repositoryRoot) => {
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/dual/pyproject.toml",
      "[project]\ndependencies = [\"httpx\"]\n",
    )
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/dual/requirements.txt",
      "httpx\n",
    )
    await writeRepositoryFile(repositoryRoot, "workbench/tools/dual/uv.lock")
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/dual/tests/test_dual.py",
    )
    await writeWorkflow(repositoryRoot, {
      tests: [
        {
          command: "uv run --frozen python -m unittest",
          directory: "workbench/tools/dual",
        },
      ],
      audit: [{ arguments: ".", directory: "workbench/tools/dual" }],
    })

    const result = await validateWorkbenchContract(repositoryRoot)

    assert.deepEqual(result.violations, [])
  })
})

test("reports invalid TOML, invalid YAML, and orphaned uv locks", async () => {
  await withRepository(async (repositoryRoot) => {
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/broken/pyproject.toml",
      "[project\n",
    )
    await writeRepositoryFile(repositoryRoot, "workbench/tools/orphan/uv.lock")
    await writeWorkflow(repositoryRoot)

    const manifestResult = await validateWorkbenchContract(repositoryRoot)

    assert.deepEqual(
      violationCodes(manifestResult),
      ["WORKBENCH_MANIFEST_INVALID", "WORKBENCH_UV_LOCK_ORPHANED"],
    )

    await writeRepositoryFile(
      repositoryRoot,
      ".github/workflows/group-workbench-python-ci.yml",
      "jobs: [\n",
    )

    const workflowResult = await validateWorkbenchContract(repositoryRoot)

    assert.deepEqual(
      new Set(violationCodes(workflowResult)),
      new Set([
        "WORKFLOW_SCHEMA_INVALID",
        "WORKBENCH_MANIFEST_INVALID",
        "WORKBENCH_UV_LOCK_ORPHANED",
      ]),
    )
    assert.equal(workflowResult.violations.length, 3)
    assert.equal(workflowResult.summary.auditEntryCount, 0)
  })
})

test("accepts Windows separators and rejects registrations that escape project paths", async () => {
  await withRepository(async (repositoryRoot) => {
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/windows/requirements.txt",
      "requests\n",
    )
    await writeRepositoryFile(
      repositoryRoot,
      "workbench/tools/windows/tests/test_windows.py",
    )
    await writeWorkflow(repositoryRoot, {
      tests: [
        {
          command: "uv run --with-requirements .\\requirements.txt python -m unittest",
          directory: "workbench\\tools\\windows",
        },
        { command: "python -m unittest", directory: "..\\outside\\project" },
        { command: "python -m unittest", directory: "C:\\outside\\project" },
        { command: "python -m unittest", directory: "./workbench/tools/windows" },
        { command: "python -m unittest", directory: "workbench/./windows" },
      ],
      audit: [
        {
          arguments: "-r requirements.txt",
          directory: "workbench\\tools\\windows",
        },
        { arguments: ".", directory: "../outside/project" },
        { arguments: ".", directory: "/outside/project" },
        { arguments: ".", directory: "./workbench/tools/windows" },
        { arguments: ".", directory: "workbench/./windows" },
      ],
    })

    const windowsRoot = process.platform === "win32"
      ? repositoryRoot.replaceAll("/", "\\")
      : repositoryRoot
    const result = await validateWorkbenchContract(windowsRoot)

    assert.equal(
      violationCodes(result).filter((code) => code === "WORKBENCH_TEST_STALE").length,
      4,
    )
    assert.equal(
      violationCodes(result).filter((code) => code === "WORKBENCH_AUDIT_STALE").length,
      4,
    )
    assert.equal(
      violationCodes(result).includes("WORKBENCH_TEST_DEPENDENCIES_MISSING"),
      false,
    )
  })
})

test("rejects empty and null-containing repository paths", async () => {
  await assert.rejects(
    validateWorkbenchContract("   "),
    /repositoryRoot must be a valid non-empty path/,
  )
  await assert.rejects(
    validateWorkbenchContract("invalid\0path"),
    /repositoryRoot must be a valid non-empty path/,
  )
})
