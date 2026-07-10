import type {UserProfile} from "@/types";

export const mockUsers: UserProfile[] = [
  {
    id: "user-shikaneko",
    username: "shikaneko",
    displayName: "Shikaneko",
    headline: "把生活拆成可维护状态页的人",
    bio: "记录身体、情绪、学习与绘画的运行状态，把个人节奏当成一个长期维护中的系统。",
    avatarLabel: "SK",
    isDiscoverable: true,
  },
  {
    id: "user-natsuki",
    username: "natsuki",
    displayName: "Natsuki",
    headline: "偏慢生活模式的稳定性观察者",
    bio: "更关注日常能量、阅读节奏和社交带宽，用轻量事件和状态维护自己的空间。",
    avatarLabel: "NA",
    isDiscoverable: true,
  },
];

export const mockUsersByUsername = Object.fromEntries(
  mockUsers.map((user) => [user.username, user]),
) satisfies Record<string, UserProfile>;
