import type { ProjectKind } from "../types/project"
import { workbenchCategories } from "./projects/workbench"
import { seoConfig } from "./seo"

const siteLocale = seoConfig.language
const siteTimeZone = "Asia/Shanghai"
const currentYear = new Intl.DateTimeFormat(siteLocale, {
  timeZone: siteTimeZone,
  year: "numeric",
}).format(new Date())

export const siteConfig = {
  name: seoConfig.name,
  url: seoConfig.siteUrl,
  locale: siteLocale,
  timeZone: siteTimeZone,
  repositoryUrl: seoConfig.repositoryUrl,
  repositoryBranch: "main",
  stats: [
    { kind: "app", label: "Apps" },
    { kind: "package", label: "Package" },
    { kind: "workbench", label: "Workbench tools" },
    { kind: "other", label: "Other experiments" },
  ] satisfies readonly { kind: ProjectKind; label: string }[],
  header: {
    brand: "Cedarflake",
    edition: `Lab / ${currentYear}`,
    homeLabel: "Cedarflake Lab home",
    sourceLabel: "GitHub",
  },
  navigation: [
    { label: "Projects", href: "#projects" },
    { label: "Workbench", href: "#workbench" },
    { label: "Open bench", href: "#open-bench" },
  ],
  hero: {
    eyebrow: "Apps, tools, and experiments by Cedarflake",
    brand: {
      src: "/Lab-nobg.png",
      alt: "Cedarflake Lab",
      width: 3500,
      height: 600,
    },
    statement: "Small tools, strange interfaces, and experiments in motion.",
    description:
      "Browse photo tools, playful interfaces, and everyday utilities. Try a demo, find something useful, or take a look at how it works.",
    primaryAction: { label: "Explore projects", href: "#projects" },
    secondaryActionLabel: "View source",
    ruler: ["01 / Index", "Living archive"],
  },
  sections: {
    featured: {
      id: "projects",
      carouselHint: "Swipe, scroll, or use arrow keys",
      heading: {
        index: "01",
        eyebrow: "Latest projects",
        titleId: "projects-title",
        title: "Fresh from the bench.",
        description: "Explore the latest apps, interactive demos, and visual experiments.",
      },
    },
    building: {
      id: "building-blocks",
      carouselHint: "More building blocks along the shelf",
      heading: {
        index: "02",
        eyebrow: "Building blocks",
        titleId: "blocks-title",
        title: "Reusable parts and practical tools.",
        description:
          "Tools for everyday tasks, components for your own projects, and demos to try in the browser.",
      },
    },
    workbench: {
      id: "workbench",
      heading: {
        index: "03",
        eyebrow: "Local workbench",
        titleId: "workbench-title",
        title: "Utilities kept close to the machine.",
        description:
          "Focused Python projects for automation, media, files, games, AI, and campus networking.",
      },
      note: "Open a project to find its source, setup instructions, and usage guide.",
    },
    others: {
      id: "other-shelves",
      carouselHint: "More oddities along the shelf",
      heading: {
        index: "04",
        eyebrow: "Other shelves",
        titleId: "others-title",
        title: "Useful things that resist a neat label.",
        description:
          "Browse userscripts, interface studies, and older experiments from the archive.",
      },
    },
  },
  workbenchCategories,
  openBench: {
    id: "open-bench",
    titleId: "open-bench-title",
    eyebrow: "05 / Open bench",
    title: "Take a closer look.",
    areas: [
      {
        label: "Apps",
        description: "Apps to explore and interactive demos to try",
      },
      {
        label: "Packages",
        description: "Components to use in your own projects",
      },
      {
        label: "Workbench",
        description: "Python utilities and local automation",
      },
      {
        label: "Others",
        description: "Userscripts, visual studies, and past experiments",
      },
    ],
    actionLabel: "Browse on GitHub",
  },
  footer: {
    links: [
      { label: "Random Image", href: "https://api.revaea.com/" },
      { label: "Redirect", href: "https://u.i0c.cc/" },
      { label: "HLS", href: "https://hls.revaea.com/" },
    ],
    note: "A personal collection of things made, tried, and shared.",
    backToTopLabel: "Back to top ↑",
  },
} as const
