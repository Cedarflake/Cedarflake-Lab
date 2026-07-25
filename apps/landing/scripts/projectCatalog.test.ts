import assert from "node:assert/strict"
import test from "node:test"

import { projectCatalog } from "../src/config/projects"
import {
  buildingProjects,
  otherProjects,
  projectKey,
  projectSourceLabel,
  projectSourceUrl,
  showcaseProjects,
  validateProjectCatalog,
  workbenchProjects,
} from "../src/lib/projectCatalog"
import type { CatalogProject, ProjectEntry } from "../src/types/project"

const workspaceProject = {
  title: "Workspace fixture",
  path: "apps/workspace-fixture",
  updatedAt: "2026-07-24T00:00:00Z",
  summary: "Exercises the repository-relative project source.",
  label: "Fixture",
  lifecycle: "active",
  kind: "app",
  presentation: "catalog",
  section: "building",
} as const satisfies CatalogProject

const externalProject = {
  title: "External fixture",
  repositoryUrl: "https://github.com/example/external-fixture",
  updatedAt: "2026-07-24T00:00:00Z",
  summary: "Exercises the external GitHub repository source.",
  label: "Fixture",
  lifecycle: "active",
  kind: "app",
  presentation: "catalog",
  section: "building",
} as const satisfies CatalogProject

function asProject(value: unknown) {
  return value as ProjectEntry
}

test("derives workspace and external repository source metadata", () => {
  validateProjectCatalog([workspaceProject, externalProject])

  assert.equal(projectKey(workspaceProject), "workspace:apps/workspace-fixture")
  assert.equal(projectSourceLabel(workspaceProject), "apps/workspace-fixture")
  assert.equal(
    projectSourceUrl(workspaceProject),
    "https://github.com/Cedarflake/Cedarflake-Lab/tree/main/apps/workspace-fixture",
  )
  assert.equal(
    projectKey(externalProject),
    "repository:https://github.com/example/external-fixture",
  )
  assert.equal(projectSourceLabel(externalProject), "example/external-fixture")
  assert.equal(projectSourceUrl(externalProject), externalProject.repositoryUrl)
})

test("allows an external repository project to own a showcase", () => {
  const externalShowcaseProject = {
    ...externalProject,
    showcase: {
      label: "External showcase",
      tags: ["External", "Preview"],
      cover: {
        src: "/covers/external-fixture.png",
        alt: "External fixture preview",
        width: 1600,
        height: 900,
      },
    },
  } as const satisfies CatalogProject

  assert.doesNotThrow(() => validateProjectCatalog([externalShowcaseProject]))
})

test("rejects missing, ambiguous, and duplicate project sources", () => {
  assert.throws(
    () => validateProjectCatalog([asProject({ ...workspaceProject, path: undefined })]),
    /Project must define exactly one source:/,
  )
  assert.throws(
    () =>
      validateProjectCatalog([
        asProject({
          ...workspaceProject,
          repositoryUrl: externalProject.repositoryUrl,
        }),
      ]),
    /Project must define exactly one source:/,
  )
  assert.throws(
    () =>
      validateProjectCatalog([
        externalProject,
        {
          ...externalProject,
          title: "Duplicate external fixture",
          repositoryUrl: "https://github.com/EXAMPLE/EXTERNAL-FIXTURE",
        },
      ]),
    /Duplicate project repository URL:/,
  )
})

test("rejects non-canonical external GitHub repository URLs", () => {
  const invalidRepositoryUrls = [
    "http://github.com/example/external-fixture",
    "https://GITHUB.com/example/external-fixture",
    "https://github.com/example/external-fixture/",
    "https://github.com/example/external-fixture.git",
    "https://github.com/example/external-fixture/tree/main",
    "https://github.com/example/external-fixture?tab=readme",
  ]

  for (const repositoryUrl of invalidRepositoryUrls) {
    assert.throws(
      () =>
        validateProjectCatalog([
          asProject({
            ...externalProject,
            repositoryUrl,
          }),
        ]),
      /Invalid project repository URL:/,
    )
  }
})

test("keeps rendered project sections mutually exclusive", () => {
  const configuredProjectKeys = projectCatalog.map(projectKey)
  const showcaseProjectKeys = showcaseProjects.map(projectKey)
  const buildingProjectKeys = buildingProjects.map(projectKey)
  const renderedProjectKeys = [
    ...showcaseProjectKeys,
    ...buildingProjectKeys,
    ...workbenchProjects.map(projectKey),
    ...otherProjects.map(projectKey),
  ]
  const i0cProjectKey = "repository:https://github.com/Revaea/i0c.cc"

  assert.equal(new Set(renderedProjectKeys).size, renderedProjectKeys.length)
  assert.deepEqual(new Set(renderedProjectKeys), new Set(configuredProjectKeys))
  assert.ok(showcaseProjectKeys.includes(i0cProjectKey))
  assert.ok(!buildingProjectKeys.includes(i0cProjectKey))
})
