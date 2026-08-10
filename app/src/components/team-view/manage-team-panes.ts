import type { TeamView } from "../../lib/teams-model";

export type ManageTeamPaneId = "agents" | "context" | "people";

export function manageTeamPanes(
  team: TeamView,
  personalSpace: boolean,
): ManageTeamPaneId[] {
  const panes: ManageTeamPaneId[] = [];
  // Context leads: it is the one thing here that changes how the team's agents
  // BEHAVE, so the screen opens on it (absent only when a server team's
  // gateway predates the field).
  if (team.server === undefined || team.context !== undefined)
    panes.push("context");
  panes.push("agents");
  if (team.server !== undefined && !personalSpace) panes.push("people");
  return panes;
}
