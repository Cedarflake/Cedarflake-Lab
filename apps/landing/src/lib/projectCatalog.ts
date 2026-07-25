import { projectCatalog } from "../config/projects"
import { siteConfig } from "../config/site"
import type {
  CatalogProject,
  LabStat,
  ProjectEntry,
  ProjectExternalActionKind,
  ProjectKind,
  ShowcaseProject,
  WorkbenchGroupData,
  WorkbenchProject,
  WorkspaceProjectEntry,
} from "../types/project"

const catalog: readonly ProjectEntry[] = projectCatalog
const isoTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/
const projectRootByKind = {
  app: "apps",
  package: "packages",
  workbench: "workbench",
  other: "others",
} satisfies Record<ProjectKind, string>
const projectRootsBySection = {
  featured: new Set(["apps", "packages"]),
  building: new Set(["apps", "packages"]),
  workbench: new Set(["workbench"]),
  others: new Set(["others"]),
} satisfies Record<ProjectEntry["section"], ReadonlySet<string>>
const catalogProjectPrefixBySection = {
  building: "B",
  others: "O",
} satisfies Record<CatalogProject["section"], string>
const projectExternalActionKinds = new Set<ProjectExternalActionKind>(["live", "install"])
const githubRepositorySegmentPattern = /^[A-Za-z0-9_.-]+$/

function isValidIsoTimestamp(value: string) {
  const match = isoTimestampPattern.exec(value)

  if (!match) {
    return false
  }

  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"))
  const zone = match[8]
  const offsetDirection = match[9] === "-" ? -1 : 1
  const offsetHour = Number(match[10] ?? "0")
  const offsetMinute = Number(match[11] ?? "0")
  const offset = zone === "Z" ? 0 : offsetDirection * (offsetHour * 60 + offsetMinute)
  const localDate = new Date(timestamp + offset * 60_000)

  return (
    localDate.getUTCFullYear() === year &&
    localDate.getUTCMonth() + 1 === month &&
    localDate.getUTCDate() === day &&
    localDate.getUTCHours() === hour &&
    localDate.getUTCMinutes() === minute &&
    localDate.getUTCSeconds() === second &&
    localDate.getUTCMilliseconds() === millisecond
  )
}

function isCanonicalGitHubRepositoryUrl(value: string) {
  try {
    const url = new URL(value)
    const pathSegments = url.pathname.split("/").filter(Boolean)
    const owner = pathSegments[0] ?? ""
    const repository = pathSegments[1] ?? ""

    return (
      url.href === value &&
      url.origin === "https://github.com" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      pathSegments.length === 2 &&
      owner !== "." &&
      owner !== ".." &&
      repository !== "." &&
      repository !== ".." &&
      !repository.toLowerCase().endsWith(".git") &&
      githubRepositorySegmentPattern.test(owner) &&
      githubRepositorySegmentPattern.test(repository) &&
      url.pathname === `/${owner}/${repository}`
    )
  } catch {
    return false
  }
}

export function isWorkspaceProject(project: ProjectEntry): project is WorkspaceProjectEntry {
  return typeof project.path === "string"
}

export function projectKey(project: ProjectEntry) {
  return isWorkspaceProject(project)
    ? `workspace:${project.path}`
    : `repository:${project.repositoryUrl}`
}

export function projectSourceLabel(project: ProjectEntry) {
  if (isWorkspaceProject(project)) {
    return project.path
  }

  return new URL(project.repositoryUrl).pathname.slice(1)
}

export function validateProjectCatalog(projects: readonly ProjectEntry[]) {
  const paths = new Set<string>()
  const repositoryUrls = new Set<string>()
  const titles = new Set<string>()

  for (const project of projects) {
    const hasPath = typeof project.path === "string"
    const hasRepositoryUrl = typeof project.repositoryUrl === "string"
    const sourceIdentity = hasPath ? project.path : hasRepositoryUrl ? project.repositoryUrl : ""
    const projectLabel = sourceIdentity.trim() || project.title.trim() || "unknown project"
    const requiredProjectText = [project.title, sourceIdentity, project.summary]

    if (hasPath === hasRepositoryUrl) {
      throw new Error(`Project must define exactly one source: ${projectLabel}`)
    }

    if (requiredProjectText.some((value) => !value.trim())) {
      throw new Error(`Missing required project text: ${projectLabel}`)
    }

    if (requiredProjectText.some((value) => value !== value.trim())) {
      throw new Error(`Project text has surrounding whitespace: ${projectLabel}`)
    }

    if (hasPath && paths.has(project.path)) {
      throw new Error(`Duplicate project path: ${project.path}`)
    }

    const normalizedRepositoryUrl = hasRepositoryUrl ? project.repositoryUrl.toLowerCase() : ""

    if (hasRepositoryUrl && repositoryUrls.has(normalizedRepositoryUrl)) {
      throw new Error(`Duplicate project repository URL: ${project.repositoryUrl}`)
    }

    const normalizedTitle = project.title.toLowerCase()

    if (titles.has(normalizedTitle)) {
      throw new Error(`Duplicate project title: ${project.title}`)
    }

    if (isWorkspaceProject(project)) {
      const pathSegments = project.path.split("/")
      const projectRoot = pathSegments[0] ?? ""

      if (
        project.path.includes("\\") ||
        pathSegments.some((segment) => !segment || segment === "." || segment === "..")
      ) {
        throw new Error(`Invalid project path: ${projectLabel}`)
      }

      if (projectRoot !== projectRootByKind[project.kind]) {
        throw new Error(`Project kind does not match its path: ${projectLabel}`)
      }

      if (!projectRootsBySection[project.section].has(projectRoot)) {
        throw new Error(`Project section does not match its path: ${projectLabel}`)
      }

      if (project.presentation === "workbench" && pathSegments[1] !== project.category) {
        throw new Error(`Workbench category does not match its path: ${projectLabel}`)
      }
    } else {
      if (!isCanonicalGitHubRepositoryUrl(project.repositoryUrl)) {
        throw new Error(`Invalid project repository URL: ${projectLabel}`)
      }

      if (project.presentation !== "catalog") {
        throw new Error(
          `External repository project must use catalog presentation: ${projectLabel}`,
        )
      }
    }

    if (project.presentation === "workbench" && project.externalAction !== undefined) {
      throw new Error(`Workbench project cannot define externalAction: ${projectLabel}`)
    }

    if (project.presentation === "catalog") {
      if (!project.label.trim()) {
        throw new Error(`Missing catalog project label: ${projectLabel}`)
      }

      if (project.label !== project.label.trim()) {
        throw new Error(`Catalog project label has surrounding whitespace: ${projectLabel}`)
      }

      if (project.lifecycle !== "active" && project.lifecycle !== "archived") {
        throw new Error(`Invalid catalog project lifecycle: ${projectLabel}`)
      }
    }

    if (!isValidIsoTimestamp(project.updatedAt)) {
      throw new Error(`Invalid project updatedAt: ${projectLabel}`)
    }

    if (project.externalAction !== undefined) {
      const { kind, url } = project.externalAction

      if (!projectExternalActionKinds.has(kind)) {
        throw new Error(`Invalid project externalAction kind: ${projectLabel}`)
      }

      try {
        if (url !== url.trim()) {
          throw new Error("Surrounding whitespace")
        }

        const parsedUrl = new URL(url)

        if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
          throw new Error("Unsafe URL")
        }
      } catch {
        throw new Error(`Invalid project externalAction URL: ${projectLabel}`)
      }
    }

    if (project.showcase) {
      const { cover, label, note, tags } = project.showcase
      const showcaseText = [
        label,
        cover.src,
        cover.alt,
        ...tags,
        ...(note === undefined ? [] : [note]),
      ]
      const normalizedTags = tags.map((tag) => tag.trim().toLowerCase())

      if (
        !label.trim() ||
        !cover.src.trim() ||
        !cover.alt.trim() ||
        !Number.isInteger(cover.width) ||
        !Number.isInteger(cover.height) ||
        cover.width <= 0 ||
        cover.height <= 0
      ) {
        throw new Error(`Invalid project showcase: ${projectLabel}`)
      }

      if (showcaseText.some((value) => value !== value.trim())) {
        throw new Error(`Project showcase text has surrounding whitespace: ${projectLabel}`)
      }

      if (note !== undefined && !note.trim()) {
        throw new Error(`Invalid project showcase note: ${projectLabel}`)
      }

      if (
        normalizedTags.length === 0 ||
        normalizedTags.some((tag) => !tag) ||
        new Set(normalizedTags).size !== normalizedTags.length
      ) {
        throw new Error(`Invalid project showcase tags: ${projectLabel}`)
      }
    }

    if (isWorkspaceProject(project)) {
      paths.add(project.path)
    } else {
      repositoryUrls.add(project.repositoryUrl.toLowerCase())
    }

    titles.add(normalizedTitle)
  }
}

if (import.meta.env?.DEV) {
  validateProjectCatalog(catalog)
}

function hasShowcase(project: ProjectEntry): project is ShowcaseProject {
  return project.showcase !== undefined
}

function isBuildingProject(project: ProjectEntry): project is CatalogProject {
  return (
    project.presentation === "catalog" && project.section === "building" && !hasShowcase(project)
  )
}

function isWorkbenchProject(project: ProjectEntry): project is WorkbenchProject {
  return project.presentation === "workbench" && !hasShowcase(project)
}

function isOtherProject(project: ProjectEntry): project is CatalogProject {
  return project.presentation === "catalog" && project.section === "others" && !hasShowcase(project)
}

function countProjects(kind: ProjectKind) {
  return catalog
    .filter((project) => project.kind === kind)
    .length.toString()
    .padStart(2, "0")
}

function lifecycleSortRank(project: ProjectEntry) {
  return project.presentation === "catalog" && project.lifecycle === "archived" ? 1 : 0
}

function compareProjects(left: ProjectEntry, right: ProjectEntry) {
  const lifecycleDifference = lifecycleSortRank(left) - lifecycleSortRank(right)

  if (lifecycleDifference !== 0) {
    return lifecycleDifference
  }

  const updatedAtDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)

  if (updatedAtDifference !== 0) {
    return updatedAtDifference
  }

  return left.title.localeCompare(right.title, siteConfig.locale)
}

function encodeUrlPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/")
}

export function projectSourceUrl(project: ProjectEntry) {
  if (!isWorkspaceProject(project)) {
    return project.repositoryUrl
  }

  return `${siteConfig.repositoryUrl}/tree/${encodeUrlPath(siteConfig.repositoryBranch)}/${encodeUrlPath(project.path)}`
}

export function projectPrimaryUrl(project: ProjectEntry) {
  return projectSourceUrl(project)
}

export function catalogProjectNumber(project: CatalogProject, index: number) {
  const prefix = catalogProjectPrefixBySection[project.section]

  return `${prefix}-${String(index + 1).padStart(2, "0")}`
}

export const showcaseProjects: readonly ShowcaseProject[] = catalog
  .filter(hasShowcase)
  .sort(compareProjects)

export const buildingProjects: readonly CatalogProject[] = catalog
  .filter(isBuildingProject)
  .sort(compareProjects)

export const workbenchProjects: readonly WorkbenchProject[] = catalog
  .filter(isWorkbenchProject)
  .sort(compareProjects)

export const otherProjects: readonly CatalogProject[] = catalog
  .filter(isOtherProject)
  .sort(compareProjects)

export const workbenchGroups: readonly WorkbenchGroupData[] = siteConfig.workbenchCategories
  .map((category) => ({
    key: category.key,
    icon: category.icon,
    title: category.title,
    items: workbenchProjects.filter((project) => project.category === category.key),
  }))
  .filter((group) => group.items.length > 0)

export const labStats: readonly LabStat[] = siteConfig.stats.map(({ kind, label }) => ({
  value: countProjects(kind),
  label,
}))
