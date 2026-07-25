import type { ShowcaseProject } from "../types/project"
import { projectKey } from "../lib/projectCatalog"
import { Carousel } from "./Carousel"
import { ProjectCard } from "./ProjectCard"

interface FeaturedCarouselProps {
  hint: string
  labelledBy: string
  projects: readonly ShowcaseProject[]
}

export function FeaturedCarousel({ hint, labelledBy, projects }: FeaturedCarouselProps) {
  return (
    <Carousel
      className="featured-carousel"
      getItemKey={projectKey}
      hint={hint}
      items={projects}
      labelledBy={labelledBy}
      renderItem={(project) => <ProjectCard project={project} />}
    />
  )
}
