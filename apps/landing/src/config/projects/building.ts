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
      "A local screenshot editor for Ame product images, with window capture, editable layouts, and PNG export.",
    label: "Screenshot editor",
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
      "A Windows image library for browsing large collections, organizing albums, and finding visually similar images.",
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
      "A self-hosted redirect project exploring routing rules, edge runtimes, and traffic analytics.",
    label: "Personal redirect system",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
    showcase: {
      label: "Personal redirect system",
      note: "Live link opens the administrator sign-in",
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
      "A browser extension that resumes paused YouTube playback, with optional skipping of visible ads and prompts.",
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
      "A personal status-page project with a private owner console and a public view of published updates.",
    label: "Status page",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
    showcase: {
      label: "Personal status project",
      note: "In development",
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
      "A configuration playground for the Focus Orb component, with controls for color, motion, and interaction.",
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
      "A React component for rendering animated WebGL orbs as buttons or ambient backgrounds.",
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
    summary:
      "A React Email starter with HTML rendering and SMTP sending scripts for custom email templates.",
    label: "Email template starter",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
  },
] as const satisfies readonly CatalogProject[]
