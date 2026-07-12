import { ArrowUpRight } from "lucide-react"

import { projectUrl } from "../lib/projectCatalog"
import type { CatalogProject } from "../types/project"

interface CatalogCardProps {
  displayNumber: string
  project: CatalogProject
}

export function CatalogCard({ displayNumber, project }: CatalogCardProps) {
  const isArchived = project.lifecycle === "archived"

  return (
    <article className="catalog-card" data-lifecycle={project.lifecycle}>
      <a href={projectUrl(project)} rel="noreferrer" target="_blank">
        <div className="catalog-card__topline">
          <span>{displayNumber}</span>
          <div className="catalog-card__labels">
            <span>{project.label}</span>
            {isArchived ? <strong className="catalog-card__archive">Archived</strong> : null}
          </div>
        </div>
        <div className="catalog-card__title-row">
          <h3>{project.title}</h3>
          <ArrowUpRight aria-hidden="true" />
        </div>
        <p>{project.summary}</p>
        <code className="source-path">{project.path}</code>
      </a>
    </article>
  )
}
