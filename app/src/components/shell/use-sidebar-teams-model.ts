import type {
  SidebarDefaultGroupView,
  SidebarGroupView,
  SidebarItem,
} from "@houston-ai/layout";
import type { TFunction } from "i18next";
import { useCallback } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import { useTeams } from "../../hooks/use-teams";
import { hasSpaces } from "../../lib/org-roles";
import {
  resolveTeamHighlight,
  sidebarSelectedAgentId,
} from "../../lib/sidebar-teams";
import {
  type TeamView,
  teamById,
  teamPeopleFace,
  visibleTeamSectionsForTeam,
} from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import type { AgentItemArgs } from "./agent-sidebar-items";
import { canEditTeamIdentity } from "./team-identity";
import { buildTeamSidebarLists } from "./team-sidebar-lists";
import { teamCollapsedLookup } from "./team-sidebar-model";
import {
  type ServerTeamActions,
  useServerTeamActions,
} from "./use-server-team-actions";
import {
  type TeamActivateHandlers,
  useTeamActivate,
} from "./use-team-activate";

/** The namespaces the labels below are read from. */
type TeamsModelT = TFunction<
  ["shell", "common", "portable", "teams", "dashboard"]
>;

export interface SidebarTeamsModel extends TeamActivateHandlers {
  /** Every team the read served, in display order. */
  teams: TeamView[];
  teamActions: ServerTeamActions;
  /** The agent row the rail draws as selected, or null for none. */
  selectedAgentId: string | null;
  items: SidebarItem[];
  groups: SidebarGroupView[];
  defaultGroup: SidebarDefaultGroupView | undefined;
}

/**
 * Everything the rail DRAWS about teams, resolved in one place: the teams
 * themselves, the writes their header menus perform, which row is lit, what a
 * click on a team's name does, and the `AppSidebar` view model they combine
 * into.
 *
 * It is one hook and not five because the steps are one pipeline — the teams
 * decide which actions exist, the actions decide each block's affordances and
 * identity picker, and the highlight decides both which block is lit and what
 * clicking it means. Splitting them would only hand the same values back and
 * forth through the caller.
 */
export function useSidebarTeamsModel(args: {
  t: TeamsModelT;
  /** Every agent in the workspace. */
  agents: Agent[];
  sidebar: UseSidebarLayout;
  /** `capabilities.agentTeams === true` — the host owns the teams (C13). */
  serverBacked: boolean;
  canCreateAgents: boolean;
  summaries: AgentItemArgs["summaries"];
  closeMobileSidebar: () => void;
}): SidebarTeamsModel {
  const { t, agents, sidebar, serverBacked, canCreateAgents } = args;
  const { capabilities } = useCapabilities();
  const viewMode = useUIStore((s) => s.viewMode);
  const activeTeamId = useUIStore((s) => s.activeTeamId);
  const teamSection = useUIStore((s) => s.teamSection);
  const teamAgentFilter = useUIStore((s) => s.teamAgentFilter);
  const teamAgentFocus = useUIStore((s) => s.teamAgentFocus);
  const teamSettingsFocus = useUIStore((s) => s.teamSettingsFocus);

  // Every agent lives in exactly one team: a named sidebar group, or the
  // trailing default team, which IS the workspace (virtual — nothing about the
  // stored layout changes to make it exist). `useTeams` is the ONE resolution
  // path, shared with the team view and the workspace shell's guard, so the
  // rail can never disagree with the screen it navigates to.
  //
  // VISIBILITY IS THE GATEWAY'S: it serves a member only the teams they are
  // part of, so every team this read hands back is one the rail draws. There is
  // no joined/other split and no "other teams" bucket anywhere, and the agent
  // store goes through whole. The space's KIND is still read — a personal space
  // holds no membership to give up, which is what the team actions ask it.
  const teams = useTeams();
  const personalSpace = usePersonalSpace();
  const teamActions = useServerTeamActions({
    serverBacked,
    teams,
    sidebar,
    canCreateAgents,
    personalSpace,
  });
  // The invariant: the rail and the view read the SAME section list for the
  // SAME team. Team Settings is a per-team door (a member may manage an agent
  // in one team and only use the agents of the next), so the list is resolved
  // per team here, and the highlight resolves against the ACTIVE team's own —
  // never another team's, which would light the wrong block or none at all.
  const sectionsForTeam = useCallback(
    (team: TeamView) =>
      visibleTeamSectionsForTeam(
        capabilities,
        team,
        teamPeopleFace(team, personalSpace, hasSpaces(capabilities)),
      ),
    [capabilities, personalSpace],
  );
  const activeTeam = teamById(teams, activeTeamId);
  const highlight = resolveTeamHighlight(
    {
      viewMode,
      activeTeamId,
      teamSection,
      teamAgentFilter,
      teamAgentFocus,
      teamSettingsFocus,
    },
    activeTeam ? sectionsForTeam(activeTeam) : [],
  );
  const collapsedLookup = teamCollapsedLookup(sidebar.layout);
  // The menu's one identity entry: opens the shared "Change icon & name"
  // dialog (the same form the create-team dialog renders). Who may edit which
  // team is `team-identity.ts`'s to decide.
  const setEditTeamIdentityId = useUIStore((s) => s.setEditTeamIdentityId);
  const onEditTeamFor = useCallback(
    (team: TeamView) =>
      canEditTeamIdentity(team, serverBacked)
        ? () => setEditTeamIdentityId(team.id)
        : undefined,
    [serverBacked, setEditTeamIdentityId],
  );

  // The rail fills EXACTLY ONE row, so the agent answer is resolved FIRST and
  // every block header is handed it: a block whose own agent is lit leaves its
  // header unfilled (`teamRowActive`). A folded block draws no agent rows, so
  // the pin must not name one — its header carries the fill instead.
  const highlightedTeam = teamById(teams, highlight.teamId);
  const selectedAgentId = sidebarSelectedAgentId({
    viewMode,
    highlight,
    activeTeam: highlightedTeam,
    collapsed: highlightedTeam ? collapsedLookup(highlightedTeam) : false,
  });

  // What a click on a team's NAME does — the rail's one hit target. The rule
  // itself is the pure, unit-tested `teamHeaderClick`; this hook is its
  // imperative half.
  const activate = useTeamActivate({
    teams,
    sidebar,
    highlight,
    collapsedLookup,
    teamAgentFilter,
    // The FIFTH arm asks whether a pin is actually being applied on screen, not
    // whether one sits in the store: clearing a pin nothing is narrowing by
    // would read as a broken click.
    selectedAgentId,
    closeMobileSidebar: args.closeMobileSidebar,
  });

  const { items, groups, defaultGroup } = buildTeamSidebarLists({
    agents,
    layout: sidebar.layout,
    teams,
    selectedAgentId,
    affordancesFor: teamActions.affordancesFor,
    // The default team is asked the same question every named team is: on a
    // host that owns the teams C13 lets its owner rename it like any other,
    // and locally it is the workspace itself, whose identity nothing in the
    // stack can change — `canEditTeamIdentity` answers both.
    onEditTeamFor,
    highlight,
    summaries: args.summaries,
    runningLabel: (count) => t("shell:sidebar.runningCount", { count }),
    needsYouLabel: (count) => t("shell:sidebar.needsYouCount", { count }),
  });

  return {
    ...activate,
    teams,
    teamActions,
    selectedAgentId,
    items,
    groups,
    defaultGroup,
  };
}
