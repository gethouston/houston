import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import { type TeamView, teamById } from "../../lib/teams-model";

export interface TeamActivateHandlers {
  onActivateGroup: (teamId: string) => void;
}

export function useTeamActivate({
  teams,
  sidebar,
}: {
  teams: TeamView[];
  sidebar: Pick<UseSidebarLayout, "toggleGroupCollapsed">;
}): TeamActivateHandlers {
  return {
    onActivateGroup: (teamId) => {
      const team = teamById(teams, teamId);
      if (team) sidebar.toggleGroupCollapsed(team.id);
    },
  };
}
