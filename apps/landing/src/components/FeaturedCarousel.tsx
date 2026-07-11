import type { ShowcaseProject } from "../types/project"
import { Carousel } from "./Carousel"
import { ProjectCard } from "./ProjectCard"

interface FeaturedCarouselProps {
  labelledBy: string
  projects: readonly ShowcaseProject[]
}

export function FeaturedCarousel({ labelledBy, projects }: FeaturedCarouselProps) {
  return (
    <Carousel
      className="featured-carousel"
      hint="Drag, scroll, or use arrow keys"
      items={projects}
      labelledBy={labelledBy}
      renderItem={(project, index) => <ProjectCard project={project} isPriority={index === 0} />}
    />
  )
}
