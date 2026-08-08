import type { SidebarLayout } from "@houston-ai/engine-client";
import type {
  SidebarDefaultGroupView,
  SidebarGroupAffordances,
  SidebarGroupView,
  SidebarItem,
  SidebarSectionRow,
} from "@houston-ai/layout";
import { Folder, LayoutDashboard, Repeat, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { flatSidebarOrder } from "../../lib/agent-order";
import type { TeamHighlight } from "../../lib/sidebar-teams";
import { teamSectionRowModels } from "../../lib/sidebar-teams";
import type { TeamSectionId, TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import {
  type AgentItemArgs,
  buildAgentSidebarItems,
} from "./agent-sidebar-items";

/**
 * One glyph per team section, mirroring the top-level nav's vocabulary so the
 * same idea wears the same mark wherever it appears (Mission Control is the
 * dashboard glyph in both places).
 */
const SECTION_ICONS: Record<TeamSectionId, ReactNode> = {
  "mission-control": <LayoutDashboard className="size-4" />,
  routines: <Repeat className="size-4" />,
  files: <Folder className="size-4" />,
  settings: <Settings className="size-4" />,
};

export interface BuildTeamSidebarListsArgs extends AgentItemArgs {
  agents: Agent[];
  layout: SidebarLayout;
  /** `useTeams()` — named teams in display order, the default team last. */
  teams: TeamView[];
  /** `visibleTeamSectionsForTeam(capabilities, team)` — the sections THIS team
   *  offers this caller. Asked per team, because Team Settings is a per-team
   *  door: a member who manages an agent here may not manage one next door. */
  sectionsForTeam: (team: TeamView) => readonly TeamSectionId[];
  /** Localized section labels, one per id (all four, gating is `sectionIds`). */
  sectionLabels: Record<TeamSectionId, string>;
  highlight: TeamHighlight;
  onOpenSection: (teamId: string, section: TeamSectionId) => void;
  /** Which header-menu affordances THIS team offers (rename / delete / shared
   *  context / leave). Asked per team, because a server-owned team may be the
   *  caller's to rename while the next one is not. Returning `undefined` — as
   *  the local backend does — passes NO mask, which is the pre-C13 rendering:
   *  every affordance the sidebar wired a callback for. */
  affordancesFor?: (team: TeamView) => SidebarGroupAffordances | undefined;
}

/**
 * Derive the `AppSidebar` view model from the teams: `items` is EVERY agent in
 * flat visible order (so the rail, the collapsed rail and ⌘[ / ⌘] cycling agree
 * on one order), `groups` places each named team's members by id, and
 * `defaultGroup` names the trailing block after the workspace. Every block also
 * carries its destination rows.
 *
 * The stored `sidebar_layout` is untouched by all of this: the default team is
 * virtual (`resolveTeams`), so a team block is a way of DRAWING the layout, not
 * a new thing written to it.
 */
export function buildTeamSidebarLists({
  agents,
  layout,
  teams,
  sectionsForTeam,
  sectionLabels,
  highlight,
  onOpenSection,
  affordancesFor,
  ...itemArgs
}: BuildTeamSidebarListsArgs): {
  items: SidebarItem[];
  groups: SidebarGroupView[];
  defaultGroup: SidebarDefaultGroupView | undefined;
} {
  const sectionsFor = (team: TeamView): SidebarSectionRow[] =>
    teamSectionRowModels(team, sectionsForTeam(team), highlight).map((row) => ({
      id: `${row.teamId}:${row.section}`,
      label: sectionLabels[row.section],
      icon: SECTION_ICONS[row.section],
      active: row.active,
      onSelect: () => onOpenSection(row.teamId, row.section),
    }));

  const storedGroups = Array.isArray(layout?.groups) ? layout.groups : [];
  const collapsedById = new Map(storedGroups.map((g) => [g.id, !!g.collapsed]));

  const items = buildAgentSidebarItems({
    agents: flatSidebarOrder(agents, layout),
    ...itemArgs,
  });

  const groups: SidebarGroupView[] = teams
    .filter((team) => !team.isDefault)
    .map((team) => {
      // Spread rather than assign: an absent mask and a mask of `undefined`
      // read the same to the library, but only the omission leaves the view
      // model literally as it was before masks existed.
      const affordances = affordancesFor?.(team);
      return {
        id: team.id,
        name: team.name,
        collapsed: collapsedById.get(team.id) ?? false,
        itemIds: team.agents.map((a) => a.id),
        sections: sectionsFor(team),
        ...(affordances ? { affordances } : {}),
      };
    });

  const defaultTeam = teams.find((team) => team.isDefault);
  const defaultGroup = defaultTeam
    ? { name: defaultTeam.name, sections: sectionsFor(defaultTeam) }
    : undefined;

  return { items, groups, defaultGroup };
}
