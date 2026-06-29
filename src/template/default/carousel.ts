import type { TemplateCarouselConfig } from "../types";
import { ASSET_BASE } from "./assets";

export const carouselConfig: TemplateCarouselConfig = {
  images: [
    {
      id: "image-1",
      srcLight: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-1-light.jpg`,
      srcDark: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-1-dark.jpg`,
      alt: "Copilot researching information on the web.",
      headline: "Research in depth",
      description: "Copilot browses the web to find, compare, and summarize information for you.",
    },
    {
      id: "image-2",
      srcLight: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-2-light.jpg`,
      srcDark: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-2-dark.jpg`,
      alt: "Copilot drafting a document.",
      headline: "Draft with precision",
      description:
        "From emails to documents, Copilot creates polished drafts based on your instructions.",
    },
    {
      id: "image-3",
      srcLight: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-3-light.jpg`,
      srcDark: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-3-dark.jpg`,
      alt: "Copilot planning and organizing a project.",
      headline: "Plan and organize",
      description: "Copilot helps you plan trips, compare options, and organize your findings.",
    },
  ],
};
