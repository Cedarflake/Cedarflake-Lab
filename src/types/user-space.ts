import type {Incident} from "./incident";
import type {LifeSection} from "./life-section";
import type {DailyStatusGranule, SlaSnapshot} from "./status-metrics";
import type {UserProfile} from "./user-profile";

export interface UserSpace {
  owner: UserProfile;
  lifeSections: LifeSection[];
  incidents: Incident[];
}

export interface UserSpaceData extends UserSpace {
  granules: DailyStatusGranule[];
  slaSnapshot: SlaSnapshot;
}
