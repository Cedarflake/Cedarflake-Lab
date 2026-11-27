import type { CatalogProject } from "../../types/project"

export const buildingProjectEntries = [
  {
    title: "InFalsusTouch",
    repositoryUrl: "https://github.com/Cedarflake/InFalsusTouch",
    externalAction: {
      kind: "install",
      url: "https://github.com/Cedarflake/InFalsusTouch/releases/tag/v0.5.0-preview.1",
    },
    updatedAt: "2026-09-29T16:16:11+08:00",
    summary:
      "An unofficial Android USB touch controller for In Falsus, with streamed gameplay, six touch keys, Field control, and multi-device co-op.",
    label: "Touch controller",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
  },
  {
    title: "Ame Screenshot Studio",
    path: "apps/ame-screenshot-studio",
    updatedAt: "2026-11-27T21:51:32+08:00",
    summary:
      "Capture Ame windows and arrange them into polished product screenshots, with editable layouts and PNG export.",
    label: "Local tool",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
  },
  {
    title: "Cedarflake Ame",
    repositoryUrl: "https://github.com/Cedarflake/Cedarflake-Ame",
    updatedAt: "2026-11-27T21:51:32+08:00",
    summary:
      "Browse large image collections, organize albums, find similar pictures, and search by what you see—all on your Windows PC.",
    label: "Desktop app",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
    showcase: {
      label: "Local photo library",
      tags: ["Windows", "Flutter", "Rust"],
      cover: {
        src: "/covers/ame.png",
        alt: "Ame gallery showing artwork thumbnails, folders, search, and an alphabetical scroll rail",
        width: 1584,
        height: 891,
      },
    },
  },
  {
    title: "Cedarflake Nami",
    repositoryUrl: "https://github.com/Cedarflake/Cedarflake-Nami",
    externalAction: {
      kind: "live",
      url: "https://u.i0c.cc",
    },
    updatedAt: "2026-08-20T00:40:54+08:00",
    summary:
      "Create and manage redirect links, choose where they run, and explore optional traffic analytics.",
    label: "Edge playground",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
    showcase: {
      label: "Redirect control plane",
      tags: ["Next.js", "Multi-provider", "Plugins"],
      cover: {
        src: "/covers/nami.png",
        alt: "Nami configuration console sign-in screen",
        width: 1600,
        height: 900,
      },
    },
  },
  {
    title: "YouTube Auto Resume Extension",
    path: "apps/youtube-auto-resume-extension",
    updatedAt: "2026-07-16T23:37:42+08:00",
    summary:
      "Keep YouTube playing with automatic pause recovery and optional skipping of visible ads and prompts.",
    label: "Browser extension",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
  },
  {
    title: "Shika",
    path: "apps/shika",
    updatedAt: "2026-10-24T17:14:25Z",
    summary:
      "Share your current status and selected updates on a personal page, with control over what becomes public.",
    label: "Status page",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
    showcase: {
      label: "Personal status app",
      tags: ["Next.js", "Turso", "Privacy-first"],
      cover: {
        src: "/covers/shika.png",
        alt: "Shika public status page showing an unreported state and no active incidents",
        width: 1600,
        height: 900,
      },
    },
  },
  {
    title: "Focus Orb Playground",
    path: "apps/focus-orb-demo",
    updatedAt: "2026-10-24T17:14:25Z",
    summary:
      "Play with a glowing orb's colors and motion, and try it as an interactive button or animated background.",
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
    updatedAt: "2026-10-24T17:14:25Z",
    summary:
      "Add an animated WebGL orb to a React project as an interactive button or ambient background.",
    label: "Package",
    lifecycle: "active",
    kind: "package",
    presentation: "catalog",
    section: "building",
  },
  {
    title: "Personal Email",
    path: "apps/personal-email",
    updatedAt: "2026-11-08T16:31:59Z",
    summary: "Preview, personalize, and send email with React Email templates and local tools.",
    label: "Local tool",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
  },
] as const satisfies readonly CatalogProject[]
