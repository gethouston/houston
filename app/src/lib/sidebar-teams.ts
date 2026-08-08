/**
 * What the sidebar paints as selected, and which destination rows each team
 * block offers. Pure so the highlight rules are unit-tested rather than read
 * off a rendered rail: "which row is lit" is the one thing a navigation surface
 * must never get wrong, and it depends on three stores at once.
 */

import {
  resolveTeamSection,
  sectionHonorsAgentPin,
  TEAM_VIEW_ID,
  type TeamSectionId,
  type TeamView,
} from "./teams-model.ts";
import { isTopLevelView } from "./top-level-views.ts";

/** The team / section / agent the open view corresponds to (all null off it). */
export interface TeamHighlight {
  teamId: string | null;
  section: TeamSectionId | null;
  agentId: string | null;
}

const NO_HIGHLIGHT: TeamHighlight = {
  teamId: null,
  section: null,
  agentId: null,
};

/**
 * Read the highlight off the UI store. Only a team view highlights a team: with
 * an agent tab or a top-level view open, the team pointers are stale leftovers
 * and lighting a row would claim the user is somewhere they are not.
 *
 * The section runs through `resolveTeamSection` against the caller's own
 * `visibleTeamSections` — the SAME call the team view makes to decide what to
 * render. Reading the raw store value instead would light nothing whenever the
 * view fell back (a section with no surface yet, or Team Settings pinned before
 * a space switch demoted the user), leaving the rail blank under a board that
 * is plainly on screen.
 */
export function resolveTeamHighlight(
  ui: {
    viewMode: string;
    activeTeamId: string | null;
    teamSection: TeamSectionId | null;
    teamAgentFilter: string | null;
  },
  sections: readonly TeamSectionId[],
): TeamHighlight {
  if (ui.viewMode !== TEAM_VIEW_ID) return NO_HIGHLIGHT;
  return {
    teamId: ui.activeTeamId,
    section: resolveTeamSection(sections, ui.teamSection),
    agentId: ui.teamAgentFilter,
  };
}

/** One destination row of one team, and whether it is the open one. */
export interface TeamSectionRowModel {
  teamId: string;
  section: TeamSectionId;
  active: boolean;
}

/**
 * The destination rows a team block renders, in `sections` order. The caller
 * passes the caller-visible list (`visibleTeamSections`), so a section the user
 * may not open never gets a row.
 */
export function teamSectionRowModels(
  team: TeamView,
  sections: readonly TeamSectionId[],
  highlight: TeamHighlight,
): TeamSectionRowModel[] {
  return sections.map((section) => ({
    teamId: team.id,
    section,
    active: highlight.teamId === team.id && highlight.section === section,
  }));
}

/**
 * Which agent row wears the selected fill. In a team view that is the shared
 * agent pin (clicking an agent narrows its team's board, routines and files, so
 * the row the user clicked stays lit) — under two conditions, both of which are
 * "the fill must describe something that is actually happening":
 *
 * - the OPEN SECTION has to honor the pin (`sectionHonorsAgentPin`). Team
 *   Settings ignores it and lists the whole team, so a lit row there would
 *   claim a narrowing nothing on screen is doing;
 * - the agent has to still be a member of the open team. Drag it into another
 *   team and every section drops the filter and shows everything
 *   (`teamPinnedAgent` / `teamFilterPath` / `resolveFilterPath`); a row left lit
 *   in its new block would point at a filter nothing is applying.
 *
 * On an agent tab it is the open agent; on any other top-level view, nothing.
 */
export function sidebarSelectedAgentId(args: {
  viewMode: string;
  highlight: TeamHighlight;
  /** The team the highlight points at, `null` off a team view. */
  activeTeam: TeamView | null;
  currentAgentId: string | null;
}): string | null {
  if (args.viewMode === TEAM_VIEW_ID) {
    const { agentId, section } = args.highlight;
    if (agentId === null || !sectionHonorsAgentPin(section)) return null;
    return args.activeTeam?.agents.some((a) => a.id === agentId)
      ? agentId
      : null;
  }
  if (isTopLevelView(args.viewMode)) return null;
  return args.currentAgentId;
}
