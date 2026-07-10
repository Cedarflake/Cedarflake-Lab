import type {LifeSection} from "@/types";

export const lifeSections: LifeSection[] = [
  {
    id: "component-physical-health",
    slug: "physical-health",
    name: "Physical Health",
    description: "身体机能模块，覆盖睡眠、体力、生病与恢复状态。",
    category: "health",
    order: 1,
    defaultVisibility: "public",
  },
  {
    id: "component-mental-core",
    slug: "mental-core",
    name: "Mental Core",
    description: "情绪内核模块，记录心情、精神负载和心理恢复情况。",
    category: "mind",
    order: 2,
    defaultVisibility: "authenticated",
  },
  {
    id: "component-study-engine",
    slug: "study-engine",
    name: "Study Engine",
    description: "学习引擎模块，承载考试备考、复习节奏与专注闭关。",
    category: "study",
    order: 3,
    defaultVisibility: "public",
  },
  {
    id: "component-art-rendering",
    slug: "art-rendering",
    name: "Art Rendering",
    description: "艺术渲染模块，追踪 CSP 练习、人体训练与作品输出状态。",
    category: "art",
    order: 4,
    defaultVisibility: "public",
  },
];
