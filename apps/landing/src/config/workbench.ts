export const workbenchCategories = [
  { key: "ai", id: "AI", title: "Artificial intelligence" },
  { key: "automation", id: "AU", title: "Automation" },
  { key: "files", id: "FI", title: "Files" },
  { key: "games", id: "GA", title: "Games" },
  { key: "media", id: "ME", title: "Media" },
  { key: "network", id: "NE", title: "Network" },
] as const

export type WorkbenchCategory = (typeof workbenchCategories)[number]["key"]
