import type { TeamView } from "../../lib/teams-model";
import { OtherTeamsBlock } from "./other-teams-block";
import { UpdateChecker } from "./update-checker";
import { UserMenu } from "./user-menu";

/**
 * The foot of the rail: the teams of this space the caller has not joined, the
 * user menu, and the update checker.
 */
export function SidebarFooter(props: {
  collapsed: boolean;
  /** `partitionTeams(...).other` — teams in the space the caller is not in. */
  otherTeams: TeamView[];
}) {
  return (
    <div className="flex flex-col">
      {/* Above the user menu, and expanded-rail only: the rows need a
          name, a member count and a Join button, none of which fit the
          icon rail, and nothing here is urgent enough to earn a
          collapsed stand-in the way a pending invitation is. */}
      {props.collapsed ? null : <OtherTeamsBlock teams={props.otherTeams} />}
      <UserMenu collapsed={props.collapsed} />
      <UpdateChecker />
    </div>
  );
}
