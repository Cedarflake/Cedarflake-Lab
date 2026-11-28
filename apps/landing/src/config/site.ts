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
    menuLabel: "Menu",
    closeMenuLabel: "Close",
  },
  navigation: [
    { label: "Projects", href: "#projects" },
    { label: "Workbench", href: "#workbench" },
    { label: "Repository", href: "#open-bench" },
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
      "A personal collection of software, from image tools and reusable components to interface and motion studies.",
    primaryAction: { label: "Explore projects", href: "#projects" },
    secondaryActionLabel: "View source",
    ruler: ["01 / Index", "Living archive"],
    poster: {
      wordmark: "cedarflake",
      manifesto: "form. function.",
      invitation: "room to play.",
      sideNote: "a study in possibility",
      collectionLabel: "The collection",
    },
  },
  sections: {
    featured: {
      id: "projects",
      carouselHint: "Swipe, scroll, or use arrow keys",
      heading: {
        index: "01",
        eyebrow: "Selected projects",
        titleId: "projects-title",
        title: "Projects in focus.",
        description: "A selection of applications, interface studies, and interactive experiments.",
      },
    },
    building: {
      id: "building-blocks",
      carouselHint: "More tools and components",
      heading: {
        index: "02",
        eyebrow: "Tools & components",
        titleId: "blocks-title",
        title: "Small projects. Specific uses.",
        description:
          "Projects for desktop workflows, browser tasks, web development, and game input.",
      },
    },
    workbench: {
      id: "workbench",
      heading: {
        index: "03",
        eyebrow: "Local workbench",
        titleId: "workbench-title",
        title: "Scripts and desktop utilities.",
        description:
          "Locally run Python projects for media, files, automation, AI services, games, and networking.",
      },
    },
    others: {
      id: "other-shelves",
      carouselHint: "More studies and archived projects",
      heading: {
        index: "04",
        eyebrow: "Studies & archive",
        titleId: "others-title",
        title: "Experiments kept on record.",
        description:
          "Interface recreations, userscripts, and game experiments. Archived projects are marked.",
      },
    },
  },
  workbenchCategories,
  openBench: {
    id: "open-bench",
    titleId: "open-bench-title",
    eyebrow: "05 / Repository",
    title: "Inside the Lab repository.",
    areas: [
      {
        label: "Apps",
        description: "Applications, demos, and development projects",
      },
      {
        label: "Packages",
        description: "Reusable frontend components",
      },
      {
        label: "Workbench",
        description: "Local Python utilities and experiments",
      },
      {
        label: "Others",
        description: "Userscripts, interface studies, and archived experiments",
      },
    ],
    actionLabel: "View repository on GitHub",
  },
  footer: {
    links: [
      { label: "Random Image", href: "https://api.revaea.com/" },
      { label: "Redirect", href: "https://u.i0c.cc/" },
      { label: "HLS", href: "https://hls.revaea.com/" },
    ],
    note: "A personal collection of things made, tried, and shared.",
    backToTopLabel: "Back to top",
  },
} as const
