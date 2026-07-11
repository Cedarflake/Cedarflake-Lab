import type { CatalogProject } from "../types/project"
import { Carousel } from "./Carousel"
import { CatalogCard } from "./CatalogCard"

interface CatalogCarouselProps {
  labelledBy: string
  projects: readonly CatalogProject[]
}

export function CatalogCarousel({ labelledBy, projects }: CatalogCarouselProps) {
  const isSparse = projects.length <= 2

  return (
    <Carousel
      className={`catalog-carousel${isSparse ? " catalog-carousel--sparse" : ""}`}
      hint="More building blocks along the shelf"
      items={projects}
      labelledBy={labelledBy}
      renderItem={(project) => <CatalogCard project={project} />}
      showControls={!isSparse}
    />
  )
}
