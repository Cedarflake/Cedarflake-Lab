import type {EntityId, Visibility} from "./common";

export type LifeSectionId = EntityId;

export type LifeSectionCategory =
  | "health"
  | "mind"
  | "study"
  | "art";

export interface LifeSection {
  id: LifeSectionId;
  slug: string;
  name: string;
  description: string;
  category: LifeSectionCategory;
  order: number;
  defaultVisibility: Visibility;
}
