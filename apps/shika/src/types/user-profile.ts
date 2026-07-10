import type {EntityId} from "./common";

export type UserId = EntityId;

export interface UserProfile {
  id: UserId;
  username: string;
  displayName: string;
  headline: string;
  bio: string;
  avatarLabel: string;
  isDiscoverable: boolean;
}
