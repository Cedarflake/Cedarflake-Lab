import type {Incident, LifeSection, UserSpace} from "@/types";

import {incidents as shikanekoIncidents} from "./incidents";
import {lifeSections as shikanekoLifeSections} from "./life-sections";
import {mockUsersByUsername} from "./users";

const natsukiLifeSections: LifeSection[] = [
  {
    id: "section-energy-garden",
    slug: "energy-garden",
    name: "Energy Garden",
    description: "追踪体力、睡眠和轻微生理波动，重点看恢复是否稳定。",
    category: "health",
    order: 1,
    defaultVisibility: "public",
  },
  {
    id: "section-reading-rhythm",
    slug: "reading-rhythm",
    name: "Reading Rhythm",
    description: "记录阅读专注区间、输入密度和掉线时刻。",
    category: "study",
    order: 2,
    defaultVisibility: "authenticated",
  },
];

const natsukiIncidents: Incident[] = [
  {
    id: "incident-natsuki-2026-05-11-slow-morning",
    slug: "slow-morning-reboot",
    kind: "log",
    title: "慢热早晨平稳重启",
    summary: "Energy Garden 用一个没有拉扯感的早晨，把整天带进了可运行区。",
    body: "没有强行提速，只是按顺序完成喝水、整理、短散步，状态意外稳定。",
    severity: "normal",
    status: "resolved",
    visibility: "public",
    isScheduled: false,
    sectionId: "section-energy-garden",
    createdAt: "2026-05-11T08:10:00+08:00",
    updatedAt: "2026-05-11T10:20:00+08:00",
    publishedAt: "2026-05-11T08:15:00+08:00",
    window: {
      startedAt: "2026-05-11T08:00:00+08:00",
      expectedEndAt: "2026-05-11T10:00:00+08:00",
      expectedDurationMinutes: 120,
      resolvedAt: "2026-05-11T10:20:00+08:00",
    },
    tags: ["morning", "routine", "normal-day"],
    timeline: [
      {
        id: "timeline-natsuki-2026-05-11-start",
        incidentId: "incident-natsuki-2026-05-11-slow-morning",
        title: "进入慢启动",
        message: "没有催自己提速，先把呼吸和动作都拉回正常频率。",
        createdAt: "2026-05-11T08:15:00+08:00",
        status: "investigating",
        visibility: "public",
        authorType: "self",
      },
      {
        id: "timeline-natsuki-2026-05-11-end",
        incidentId: "incident-natsuki-2026-05-11-slow-morning",
        title: "平稳收束",
        message: "到上午中段依旧没有明显掉速，这次重启值得归档。",
        createdAt: "2026-05-11T10:20:00+08:00",
        status: "resolved",
        visibility: "public",
        authorType: "self",
      },
    ],
  },
  {
    id: "incident-natsuki-2026-05-22-reading-drift",
    slug: "reading-drift-notice",
    kind: "issue",
    title: "阅读节奏轻微漂移",
    summary: "Reading Rhythm 在午后输入密度过高时开始掉线，进入轻微 notice。",
    body: "眼睛还在看，脑子却没有真正吸收内容，只能把阅读计划切回更短的片段。",
    severity: "notice",
    status: "resolved",
    visibility: "authenticated",
    isScheduled: false,
    sectionId: "section-reading-rhythm",
    createdAt: "2026-05-22T14:00:00+08:00",
    updatedAt: "2026-05-22T20:10:00+08:00",
    publishedAt: "2026-05-22T14:05:00+08:00",
    window: {
      startedAt: "2026-05-22T14:00:00+08:00",
      expectedEndAt: "2026-05-22T20:00:00+08:00",
      expectedDurationMinutes: 360,
      resolvedAt: "2026-05-22T20:10:00+08:00",
    },
    tags: ["reading", "notice", "focus"],
    timeline: [
      {
        id: "timeline-natsuki-2026-05-22-start",
        incidentId: "incident-natsuki-2026-05-22-reading-drift",
        title: "开始打滑",
        message: "从第三个章节开始，眼睛往前走了，内容却没有真正留下来。",
        createdAt: "2026-05-22T14:05:00+08:00",
        status: "investigating",
        visibility: "authenticated",
        authorType: "self",
      },
      {
        id: "timeline-natsuki-2026-05-22-identified",
        incidentId: "incident-natsuki-2026-05-22-reading-drift",
        title: "决定降载",
        message: "把阅读块切成 15 分钟，并且暂停继续加新材料。",
        createdAt: "2026-05-22T16:10:00+08:00",
        status: "identified",
        visibility: "authenticated",
        authorType: "self",
      },
      {
        id: "timeline-natsuki-2026-05-22-end",
        incidentId: "incident-natsuki-2026-05-22-reading-drift",
        title: "重新稳定",
        message: "减载后终于重新能记住内容，notice 结束。",
        createdAt: "2026-05-22T20:10:00+08:00",
        status: "resolved",
        visibility: "authenticated",
        authorType: "self",
      },
    ],
  },
];

export const mockUserSpaces: UserSpace[] = [
  {
    owner: mockUsersByUsername.shikaneko,
    lifeSections: shikanekoLifeSections,
    incidents: shikanekoIncidents,
  },
  {
    owner: mockUsersByUsername.natsuki,
    lifeSections: natsukiLifeSections,
    incidents: natsukiIncidents,
  },
];

export const mockUserSpacesByUsername = Object.fromEntries(
  mockUserSpaces.map((space) => [space.owner.username, space]),
) satisfies Record<string, UserSpace>;
