import {buildDailyStatusGranules} from "@/lib/domain/status-granules";
import {calculateSlaSnapshot} from "@/lib/domain/uptime";
import type {UserSpace, UserSpaceData} from "@/types";

import {incidents} from "./incidents";
import {lifeSections} from "./life-sections";
import {mockUserSpaces, mockUserSpacesByUsername} from "./user-spaces";
import {mockUsers, mockUsersByUsername} from "./users";

export const shikanekoDemoRange = {
  label: "最近 45 天",
  startedAt: "2026-04-14T00:00:00+08:00",
  endedAt: "2026-05-28T00:00:00+08:00",
  granuleStartDate: "2026-04-14",
  granuleDays: 45,
} as const;

export function buildMockUserSpaceData(space: UserSpace): UserSpaceData {
  return {
    ...space,
    granules: buildDailyStatusGranules({
      incidents: space.incidents,
      startDate: shikanekoDemoRange.granuleStartDate,
      days: shikanekoDemoRange.granuleDays,
    }),
    slaSnapshot: calculateSlaSnapshot({
      incidents: space.incidents,
      startedAt: shikanekoDemoRange.startedAt,
      endedAt: shikanekoDemoRange.endedAt,
      label: shikanekoDemoRange.label,
    }),
  };
}

export const mockUserSpaceData = mockUserSpaces.map(buildMockUserSpaceData);

export const mockUserSpaceDataByUsername = Object.fromEntries(
  mockUserSpaceData.map((space) => [space.owner.username, space]),
) satisfies Record<string, UserSpaceData>;

export const studioUsername = "shikaneko" as const;

export function getMockUserSpaceData(username: string) {
  return mockUserSpaceDataByUsername[username] ?? null;
}

export function getStudioUserSpaceData() {
  return getMockUserSpaceData(studioUsername) ?? mockUserSpaceData[0] ?? null;
}

export {incidents, lifeSections, mockUsers, mockUsersByUsername, mockUserSpaces, mockUserSpacesByUsername};
