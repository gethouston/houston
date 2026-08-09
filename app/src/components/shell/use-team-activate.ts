import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import type { TeamHighlight } from "../../lib/sidebar-teams";
import {
  TEAM_HOME_SECTION,
  teamHeaderClick,
} from "../../lib/team-header-click";
import { type TeamView, teamById } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";

/** What the rail hands `AppSidebar` for its two header callbacks. */
export interface TeamActivateHandlers {
  /** A named team's header row was clicked. */
  onActivateGroup: (teamId: string) => void;
  /** The DEFAULT team's header row was clicked (it hands back no id). */
  onActivateDefault: () => void;
}

/**
 * The IMPERATIVE half of the rail's one hit target.
 *
 * A team's name is the only thing a block can be clicked on, and what that
 * means depends on where the user already is. The DECISION is the pure,
 * unit-tested `teamHeaderClick`; this is only the execution, kept apart from it
 * because a rule you can read in isolation is a rule you can be sure of, and
 * kept apart from `use-sidebar-teams-model.ts` because "what the rail draws"
 * and "what a click does" are two jobs that happen to need the same inputs.
 */
export function useTeamActivate({
  teams,
  sidebar,
  highlight,
  collapsedLookup,
  teamAgentFilter,
  selectedAgentId,
  closeMobileSidebar,
}: {
  /** `useTeams()` — every team the rail draws, in display order. */
  teams: TeamView[];
  sidebar: UseSidebarLayout;
  /** Where the user IS, resolved the same way the lit row is. */
  highlight: TeamHighlight;
  /** That team's block is folded shut (`teamCollapsedLookup`). */
  collapsedLookup: (team: TeamView) => boolean;
  /** The live agent pin, which rides along on a move INSIDE one team. */
  teamAgentFilter: string | null;
  /** The agent row the rail is actually FILLING (`sidebarSelectedAgentId`), or
   *  null. The fifth arm turns on this and not on the stored pin: a pin nothing
   *  on screen is narrowing by must not swallow the click. */
  selectedAgentId: string | null;
  closeMobileSidebar: () => void;
}): TeamActivateHandlers {
  const openTeamView = useUIStore((s) => s.openTeamView);
  const setTeamAgentFilter = useUIStore((s) => s.setTeamAgentFilter);

  const activate = (team: TeamView) => {
    const click = teamHeaderClick({
      teamId: team.id,
      collapsed: collapsedLookup(team),
      activeTeamId: highlight.teamId,
      section: highlight.section,
      agentPinned:
        selectedAgentId !== null &&
        team.agents.some((agent) => agent.id === selectedAgentId),
    });
    switch (click.kind) {
      case "open-solo":
        // Omitting `agentFilter` CLEARS it: this arm arrives from another team,
        // and a pin naming an agent this one does not hold would narrow to
        // nothing.
        openTeamView(team.id, TEAM_HOME_SECTION);
        // ONE layout write, not one per team folded: N toggles off a single
        // click would race each other through the same optimistic cache.
        sidebar.expandOnlyTeam({
          teamId: team.id,
          isDefault: team.isDefault,
          namedTeamIds: teams
            .filter((other) => !other.isDefault)
            .map((other) => other.id),
        });
        closeMobileSidebar();
        break;
      case "open":
        // Coming back to Tasks INSIDE this team, so the agent pin rides along:
        // someone looking at Kai's routines means Kai's tasks.
        openTeamView(team.id, TEAM_HOME_SECTION, {
          agentFilter: teamAgentFilter,
        });
        closeMobileSidebar();
        break;
      case "clear-pin":
        // The team's name IS its "all agents" row. Widening back to the whole
        // team is a screen change, so the mobile drawer gets out of the way;
        // the fold is untouched, because the user asked about the BOARD.
        setTeamAgentFilter(null);
        closeMobileSidebar();
        break;
      case "collapse":
      case "expand":
        // The screen does not move. The header keeps its active pill and picks
        // up its rollup badge, so a folded block is still saying where the user
        // is and what its agents need.
        if (team.isDefault) sidebar.toggleDefaultCollapsed();
        else sidebar.toggleGroupCollapsed(team.id);
        break;
    }
  };

  return {
    onActivateGroup: (teamId) => {
      const team = teamById(teams, teamId);
      if (team) activate(team);
    },
    onActivateDefault: () => {
      const team = teams.find((one) => one.isDefault);
      if (team) activate(team);
    },
  };
}
