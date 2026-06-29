import type { TemplateHeroConfig } from "../types";
import { ASSET_BASE } from "./assets";

export const heroConfig: TemplateHeroConfig = {
  headlineTop: "The new way to",
  headlineBottom: "get things done",
  description:
    "Copilot Tasks works in the background to handle your to-dos -- from research to scheduling to creating documents.",
  backgroundLight: `${ASSET_BASE}/images/tasks/waitlist/background/background-light.jpg`,
  backgroundDark: `${ASSET_BASE}/images/tasks/waitlist/background/background-dark.jpg`,
  scrollIndicator: "Scroll",
};
