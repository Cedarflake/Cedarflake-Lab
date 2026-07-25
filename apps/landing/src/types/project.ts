export type ProjectKind = "app" | "package" | "workbench" | "other"
export type ProjectLifecycle = "active" | "archived"
export type ProjectExternalActionKind = "live" | "install"
export type WorkbenchIconName =
  "brain-circuit" | "workflow" | "folder-open" | "gamepad-2" | "images" | "network"

export interface ProjectExternalAction {
  kind: ProjectExternalActionKind
  url: `https://${string}`
}

export interface ProjectCover {
  src: `/covers/${string}.png`
  alt: string
  width: number
  height: number
}

export interface ProjectShowcase {
  label: string
  tags: readonly string[]
  note?: string
  cover: ProjectCover
}

interface ProjectBase {
  title: string
  updatedAt: string
  summary: string
  kind: ProjectKind
}

interface WorkspaceProjectSource {
  path: string
  repositoryUrl?: never
}

interface ExternalRepositoryProjectSource {
  path?: never
  repositoryUrl: `https://github.com/${string}/${string}`
}

interface ProjectShowcaseOptional {
  showcase?: ProjectShowcase
}

interface ProjectActionable {
  externalAction?: ProjectExternalAction
}

export type FeaturedProject = ProjectBase &
  WorkspaceProjectSource &
  ProjectActionable & {
    presentation: "featured"
    section: "featured"
    showcase: ProjectShowcase
  }

export type CatalogProject = ProjectBase &
  ProjectActionable &
  (WorkspaceProjectSource | ExternalRepositoryProjectSource) &
  ProjectShowcaseOptional & {
    presentation: "catalog"
    section: "building" | "others"
    label: string
    lifecycle: ProjectLifecycle
  }

export type WorkbenchProject<Category extends string = string> = ProjectBase &
  WorkspaceProjectSource &
  ProjectShowcaseOptional & {
    presentation: "workbench"
    section: "workbench"
    category: Category
    externalAction?: never
  }

export type ProjectEntry = FeaturedProject | CatalogProject | WorkbenchProject

export type ShowcaseProject = ProjectEntry & { showcase: ProjectShowcase }
export type WorkspaceProjectEntry = ProjectEntry & WorkspaceProjectSource

export interface WorkbenchGroupData {
  key: string
  icon: WorkbenchIconName
  title: string
  items: readonly WorkbenchProject[]
}

export interface LabStat {
  value: string
  label: string
}
