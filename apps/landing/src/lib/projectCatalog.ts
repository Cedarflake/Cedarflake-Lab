import { projectCatalog } from "../config/projects"
import { siteConfig } from "../config/site"
import type {
  CatalogProject,
  LabStat,
  ProjectEntry,
  ProjectKind,
  ShowcaseProject,
  WorkbenchGroupData,
  WorkbenchProject,
} from "../types/project"

const catalog: readonly ProjectEntry[] = projectCatalog

function assertUniqueProjects(projects: readonly ProjectEntry[]) {
  const ids = new Set<string>()
  const paths = new Set<string>()

  for (const project of projects) {
    if (ids.has(project.id)) {
      throw new Error(`Duplicate project id: ${project.id}`)
    }

    if (paths.has(project.path)) {
      throw new Error(`Duplicate project path: ${project.path}`)
    }

    if (Number.isNaN(Date.parse(project.updatedAt))) {
      throw new Error(`Invalid project updatedAt: ${project.id}`)
    }

    if (
      project.showcase &&
      (!project.showcase.cover.src ||
        project.showcase.cover.width <= 0 ||
        project.showcase.cover.height <= 0)
    ) {
      throw new Error(`Invalid project cover: ${project.id}`)
    }

    ids.add(project.id)
    paths.add(project.path)
  }
}

assertUniqueProjects(catalog)

function hasShowcase(project: ProjectEntry): project is ShowcaseProject {
  return project.showcase !== undefined
}

function isBuildingProject(project: ProjectEntry): project is CatalogProject {
  return project.presentation === "catalog" && project.section === "building"
}

function isWorkbenchProject(project: ProjectEntry): project is WorkbenchProject {
  return project.presentation === "workbench"
}

function isOtherProject(project: ProjectEntry): project is CatalogProject {
  return project.presentation === "catalog" && project.section === "others"
}

function countProjects(kind: ProjectKind) {
  return catalog
    .filter((project) => project.kind === kind)
    .length.toString()
    .padStart(2, "0")
}

function compareByUpdatedAt(left: ProjectEntry, right: ProjectEntry) {
  const updatedAtDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)

  if (updatedAtDifference !== 0) {
    return updatedAtDifference
  }

  return left.title.localeCompare(right.title, "en")
}

export function projectSourceUrl(path: string) {
  return `${siteConfig.repositoryUrl}/tree/${siteConfig.repositoryBranch}/${path}`
}

export function projectUrl(project: ProjectEntry) {
  return project.externalUrl ?? projectSourceUrl(project.path)
}

export const showcaseProjects = catalog.filter(hasShowcase).sort(compareByUpdatedAt)

export const buildingProjects = catalog.filter(isBuildingProject)

export const workbenchProjects = catalog.filter(isWorkbenchProject)

export const otherProjects = catalog.filter(isOtherProject)

export const workbenchGroups: readonly WorkbenchGroupData[] = siteConfig.workbenchCategories
  .map((category) => ({
    id: category.id,
    title: category.title,
    items: workbenchProjects.filter((project) => project.category === category.key),
  }))
  .filter((group) => group.items.length > 0)

export const labStats = siteConfig.stats.map(({ kind, label }) => ({
  value: countProjects(kind),
  label,
})) satisfies readonly LabStat[]
