import type { CatalogProject } from "../../types/project"

export const buildingProjectEntries = [
  {
    title: "Focus Orb Playground",
    path: "apps/focus-orb-demo",
    updatedAt: "2026-07-11T10:09:02+08:00",
    summary:
      "An interactive bench for tuning the WebGL orb as a focus button or ambient background.",
    label: "Demo",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
    showcase: {
      label: "Interactive playground",
      tags: ["React", "WebGL", "Component demo"],
      cover: {
        src: "/covers/focus-orb-demo.png",
        alt: "Focus Orb Playground controls and WebGL orb",
        width: 1600,
        height: 900,
      },
    },
  },
  {
    title: "Focus Orb",
    path: "packages/focus-orb",
    updatedAt: "2026-07-11T10:09:02+08:00",
    summary:
      "The reusable React WebGL component behind the playground, packaged for app-level composition.",
    label: "Package",
    lifecycle: "active",
    kind: "package",
    presentation: "catalog",
    section: "building",
  },
  {
    title: "Personal Email",
    path: "apps/personal-email",
    updatedAt: "2026-07-11T10:09:02+08:00",
    summary:
      "React Email templates and local scripts for rendering, selecting, and delivering personal mail.",
    label: "Local tool",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
  },
] as const satisfies readonly CatalogProject[]
