import type { DragEvent } from "react"

import { BauhausPoster } from "./components/BauhausPoster"
import { CatalogCarousel } from "./components/CatalogCarousel"
import { FeaturedCarousel } from "./components/FeaturedCarousel"
import { SectionHeading } from "./components/SectionHeading"
import { SiteHeader } from "./components/SiteHeader"
import { WorkbenchGroup } from "./components/WorkbenchGroup"
import { siteConfig } from "./config/site"
import { useEntranceReveal } from "./hooks/useEntranceReveal"
import {
  buildingProjects,
  otherProjects,
  showcaseProjects,
  workbenchGroups,
} from "./lib/projectCatalog"

function preventLinkDrag(event: DragEvent<HTMLElement>) {
  if (event.target instanceof Element && event.target.closest("a")) {
    event.preventDefault()
  }
}

export function App() {
  const siteShellRef = useEntranceReveal()

  return (
    <div className="site-shell" data-motion-root ref={siteShellRef} onDragStart={preventLinkDrag}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <SiteHeader />

      <main id="main-content" tabIndex={-1}>
        <BauhausPoster />

        <section
          className="page-section"
          id={siteConfig.sections.featured.id}
          tabIndex={-1}
          aria-labelledby={siteConfig.sections.featured.heading.titleId}
          data-reveal
        >
          <SectionHeading {...siteConfig.sections.featured.heading} />
          <FeaturedCarousel
            hint={siteConfig.sections.featured.carouselHint}
            labelledBy={siteConfig.sections.featured.heading.titleId}
            projects={showcaseProjects}
          />
        </section>

        <section
          className="page-section page-section--catalog"
          id={siteConfig.sections.building.id}
          aria-labelledby={siteConfig.sections.building.heading.titleId}
          data-reveal
        >
          <SectionHeading {...siteConfig.sections.building.heading} />
          <CatalogCarousel
            hint={siteConfig.sections.building.carouselHint}
            labelledBy={siteConfig.sections.building.heading.titleId}
            projects={buildingProjects}
          />
        </section>

        <section
          className="page-section page-section--workbench"
          id={siteConfig.sections.workbench.id}
          tabIndex={-1}
          aria-labelledby={siteConfig.sections.workbench.heading.titleId}
          data-reveal
        >
          <div className="workbench-intro">
            <SectionHeading {...siteConfig.sections.workbench.heading} />
          </div>
          <div className="workbench-groups">
            {workbenchGroups.map((group) => (
              <WorkbenchGroup key={group.key} group={group} />
            ))}
          </div>
        </section>

        <section
          className="page-section page-section--others"
          id={siteConfig.sections.others.id}
          aria-labelledby={siteConfig.sections.others.heading.titleId}
          data-reveal
        >
          <SectionHeading {...siteConfig.sections.others.heading} />
          <CatalogCarousel
            hint={siteConfig.sections.others.carouselHint}
            labelledBy={siteConfig.sections.others.heading.titleId}
            projects={otherProjects}
          />
        </section>

        <section
          className="open-bench"
          id={siteConfig.openBench.id}
          tabIndex={-1}
          aria-labelledby={siteConfig.openBench.titleId}
          data-reveal
        >
          <div className="open-bench__heading">
            <p className="eyebrow">{siteConfig.openBench.eyebrow}</p>
            <h2 id={siteConfig.openBench.titleId}>{siteConfig.openBench.title}</h2>
          </div>
          <ul className="bench-stack" aria-label="Workspace areas">
            {siteConfig.openBench.areas.map((area) => (
              <li key={area.label}>
                <span>{area.label}</span>
                <p>{area.description}</p>
              </li>
            ))}
          </ul>
          <a href={siteConfig.repositoryUrl} rel="noreferrer" target="_blank">
            {siteConfig.openBench.actionLabel}
          </a>
        </section>
      </main>

      <footer className="site-footer" data-reveal>
        <p className="site-footer__brand">{siteConfig.name}</p>
        <div className="site-footer__middle">
          <nav className="site-footer__links" aria-label="Related websites">
            <ul>
              {siteConfig.footer.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} rel="noreferrer" target="_blank">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <p className="site-footer__note">{siteConfig.footer.note}</p>
        </div>
        <a className="site-footer__back-to-top" href="#top">
          {siteConfig.footer.backToTopLabel}
        </a>
      </footer>
    </div>
  )
}
