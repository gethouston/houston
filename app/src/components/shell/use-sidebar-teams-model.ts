import type {
  SidebarDefaultGroupView,
  SidebarGroupView,
  SidebarItem,
} from "@houston-ai/layout";
import type { TFunction } from "i18next";
import { useCallback } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import { useTeams } from "../../hooks/use-teams";
import { partitionTeams } from "../../lib/server-teams-model";
import {
  resolveTeamHighlight,
  sidebarSelectedAgentId,
} from "../../lib/sidebar-teams";
import {
  type TeamView,
  teamById,
  visibleTeamSectionsForTeam,
} from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import type { AgentItemArgs } from "./agent-sidebar-items";
import { buildTeamSectionLabels } from "./sidebar-chrome";
import { buildTeamSidebarLists } from "./team-sidebar-lists";
import { agentsInTeams } from "./team-sidebar-model";
import {
  type ServerTeamActions,
  useServerTeamActions,
} from "./use-server-team-actions";

/** The namespaces the labels below are read from. */
type TeamsModelT = TFunction<["shell", "common", "portable", "teams"]>;

export interface SidebarTeamsModel {
  /** Every team the caller can see, joined or not, in display order. */
  teams: TeamView[];
  /** The teams of this space the caller has not joined (`partitionTeams`). */
  other: TeamView[];
  teamActions: ServerTeamActions;
  /** The agent row the rail draws as selected, or null for none. */
  selectedAgentId: string | null;
  items: SidebarItem[];
  groups: SidebarGroupView[];
  defaultGroup: SidebarDefaultGroupView | undefined;
}

/**
 * Everything the rail DRAWS about teams, resolved in one place: the teams
 * themselves, the writes their header menus perform, which row is lit, and the
 * `AppSidebar` view model the three combine into.
 *
 * It is one hook and not four because the steps are one pipeline — the
 * partition decides which teams get actions, the actions decide each block's
 * affordances, and the highlight decides which of its rows is active. Splitting
 * them would only hand the same values back and forth through the caller.
 */
export function useSidebarTeamsModel(args: {
  t: TeamsModelT;
  /** Every agent in the workspace, before the partition narrows them. */
  agents: Agent[];
  sidebar: UseSidebarLayout;
  /** `capabilities.agentTeams === true` — the host owns the teams (C13). */
  serverBacked: boolean;
  canCreateAgents: boolean;
  summaries: AgentItemArgs["summaries"];
  onChangeColor: (agentId: string, color: string) => void;
  closeMobileSidebar: () => void;
}): SidebarTeamsModel {
  const { t, agents, sidebar, serverBacked, canCreateAgents } = args;
  const { capabilities } = useCapabilities();
  const viewMode = useUIStore((s) => s.viewMode);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const activeTeamId = useUIStore((s) => s.activeTeamId);
  const teamSection = useUIStore((s) => s.teamSection);
  const teamAgentFilter = useUIStore((s) => s.teamAgentFilter);

  // Every agent lives in exactly one team: a named sidebar group, or the
  // trailing default team, which IS the workspace (virtual — nothing about the
  // stored layout changes to make it exist). `useTeams` is the ONE resolution
  // path, shared with the team view and the workspace shell's guard, so the
  // rail can never disagree with the screen it navigates to.
  const teams = useTeams();
  // On a server-teams host (C13) the space may hold teams this user never
  // joined. Those are NOT "Your teams": they get a disclosure of their own at
  // the foot of the rail, and their agents are kept out of the blocks above so
  // the default team's leftovers cannot quietly adopt them. Off-capability
  // there is nothing to partition — every team is the user's own.
  const { joined, other } = partitionTeams(teams);
  const teamActions = useServerTeamActions({
    serverBacked,
    teams: joined,
    sidebar,
    newTeamName: t("shell:sidebar.teams.newDefault"),
    canCreateAgents,
  });
  // The invariant: the rail and the view read the SAME section list for the
  // SAME team. Team Settings is a per-team door (a member may manage an agent
  // in one team and only use the agents of the next), so the list is resolved
  // per team here, and the highlight resolves against the ACTIVE team's own —
  // never another team's, which would light the wrong row or none at all.
  const sectionsForTeam = useCallback(
    (team: TeamView) => visibleTeamSectionsForTeam(capabilities, team),
    [capabilities],
  );
  const activeTeam = teamById(teams, activeTeamId);
  const highlight = resolveTeamHighlight(
    { viewMode, activeTeamId, teamSection, teamAgentFilter },
    activeTeam ? sectionsForTeam(activeTeam) : [],
  );
  const { items, groups, defaultGroup } = buildTeamSidebarLists({
    agents: agentsInTeams(agents, joined),
    layout: sidebar.layout,
    teams: joined,
    sectionsForTeam,
    affordancesFor: teamActions.affordancesFor,
    sectionLabels: buildTeamSectionLabels(t),
    highlight,
    // Moving between a team's destinations KEEPS the agent pin. Someone who
    // clicked Kai and is looking at Kai's missions means Kai's routines and
    // Kai's files when they click those rows next; dropping the pin on the way
    // would answer a question they did not ask. A pin naming an agent the
    // destination team does not hold is dropped where it is read
    // (`teamPinnedAgent` / `resolveFilterPath`), so crossing to another team
    // still opens on the whole team.
    onOpenSection: (teamId, section) => {
      openTeamView(teamId, section, { agentFilter: teamAgentFilter });
      args.closeMobileSidebar();
    },
    summaries: args.summaries,
    runningLabel: (count) => t("shell:sidebar.runningCount", { count }),
    needsYouLabel: (count) => t("shell:sidebar.needsYouCount", { count }),
    unreadLabel: (count) => t("shell:sidebar.unreadCount", { count }),
    onChangeColor: args.onChangeColor,
    onShareAgent: (agentId) => useUIStore.getState().setShareAgentId(agentId),
    shareLabel: t("portable:exportMenu"),
  });

  return {
    teams,
    other,
    teamActions,
    selectedAgentId: sidebarSelectedAgentId({
      viewMode,
      highlight,
      activeTeam: teamById(teams, highlight.teamId),
    }),
    items,
    groups,
    defaultGroup,
  };
}
