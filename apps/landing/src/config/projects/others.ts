import type { CatalogProject } from "../../types/project"

export const otherProjectEntries = [
  {
    title: "Refrain Trainer",
    path: "others/game-tools/refrain-trainer",
    updatedAt: "2026-10-18T17:32:14+08:00",
    summary:
      "A Chinese-language Windows trainer for Labyrinth of Refrain, with one-hit kills, Witch's Crest drops, and Legendary equipment options.",
    label: "Game trainer · Preview",
    lifecycle: "archived",
    kind: "other",
    presentation: "catalog",
    section: "others",
  },
  {
    title: "Google AI Mode Aurora Study",
    path: "others/interface-studies/google-ai-mode-aurora",
    updatedAt: "2026-07-12T22:02:53+08:00",
    summary:
      "A standalone interface study recreating the cursor-responsive Aurora edge glow from Google Search.",
    label: "Interface study",
    lifecycle: "active",
    kind: "other",
    presentation: "catalog",
    section: "others",
  },
  {
    title: "YouTube Auto Resume",
    path: "others/userscripts/youtube-auto-resume",
    externalAction: {
      kind: "install",
      url: "https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/others/userscripts/youtube-auto-resume/dist/youtube-auto-resume.user.js",
    },
    updatedAt: "2026-07-15T22:14:41+08:00",
    summary:
      "An earlier userscript for resuming paused YouTube playback. The browser extension continues the project.",
    label: "Userscript",
    lifecycle: "archived",
    kind: "other",
    presentation: "catalog",
    section: "others",
  },
  {
    title: "Bilibili Follow Cycle",
    path: "others/userscripts/bilibili-follow-cycle",
    externalAction: {
      kind: "install",
      url: "https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/others/userscripts/bilibili-follow-cycle/bilibili-follow-cycle.user.js",
    },
    updatedAt: "2026-07-13T23:30:17+08:00",
    summary:
      "A browser userscript for controlled follow and unfollow cycles with interval and log panels.",
    label: "Userscript",
    lifecycle: "archived",
    kind: "other",
    presentation: "catalog",
    section: "others",
  },
  {
    title: "GitHub Star Cycle",
    path: "others/github-actions/star-cycle",
    updatedAt: "2026-07-11T01:01:23+08:00",
    summary: "An archived experiment with scheduled GitHub Star and Unstar actions.",
    label: "GitHub action",
    lifecycle: "archived",
    kind: "other",
    presentation: "catalog",
    section: "others",
  },
] as const satisfies readonly CatalogProject[]
