/**
 * What the sidebar paints as selected. Pure so the highlight rules are
 * unit-tested rather than read off a rendered rail: "which row is lit" is the
 * one thing a navigation surface must never get wrong, and it depends on three
 * stores at once.
 */

import {
  resolveTeamSection,
  sectionHonorsAgentPin,
  TEAM_VIEW_ID,
  type TeamSectionId,
  type TeamView,
} from "./teams-model.ts";

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
 * any other top-level view open, the team pointers are stale leftovers and
 * lighting a row would claim the user is somewhere they are not.
 *
 * `sections` must be the ACTIVE team's own list — `visibleTeamSectionsForTeam`
 * of the team `activeTeamId` names, the SAME call the team view makes for the
 * same team. That is the whole invariant: the rail and the view read one list
 * per team, so a row can never be lit for a section the screen refuses, and the
 * screen can never render a section with no row. Another team's list would
 * answer about the wrong door (Team Settings is per team).
 *
 * The section runs through `resolveTeamSection` rather than the raw store value,
 * so the rail follows the view's own fallback (a section with no surface yet, or
 * Team Settings pinned before a space switch demoted the caller) instead of
 * going blank under a board that is plainly on screen.
 *
 * An EMPTY `sections` means the active team no longer resolves; nothing is lit,
 * which is honest for the single frame before `blockedTeamView` sends the user
 * to the dashboard, and it keeps `resolveTeamSection` from being asked to pick
 * from nothing.
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
  if (sections.length === 0) return NO_HIGHLIGHT;
  return {
    teamId: ui.activeTeamId,
    section: resolveTeamSection(sections, ui.teamSection),
    agentId: ui.teamAgentFilter,
  };
}

/**
 * Whether the TEAM ROW wears the active fill.
 *
 * **Exactly one row in the rail is ever filled.** A block carries no
 * destination rows any more, so its header is what answers "where am I" for the
 * team — but the moment the board is narrowed to one agent, that AGENT's row is
 * the more precise answer and the header steps aside. Two fills in one block
 * claim the user is in two places at once, which is worse than one that is
 * merely coarse.
 *
 * So the header lights whenever the open view belongs to this team AND no agent
 * row inside it is lit. That covers the folded block (its agent rows are not
 * drawn), Team Settings (which lists the whole team and honors no pin), a pin
 * naming an agent this team no longer holds, and the plain unfiltered board —
 * every case where nothing narrower is on screen to speak for the block.
 *
 * `section === null` is false: `resolveTeamHighlight` returns it off a team
 * view and when the active team no longer resolves, and lighting a block over
 * a dashboard would name a screen that is not there.
 */
export function teamRowActive(args: {
  teamId: string;
  highlight: TeamHighlight;
  /** An AGENT row inside this block is already lit (`sidebarSelectedAgentId`
   *  resolved to one of its members). The block's own fill defers to it. */
  agentRowLit: boolean;
}): boolean {
  if (args.agentRowLit) return false;
  return (
    args.highlight.teamId === args.teamId && args.highlight.section !== null
  );
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
 * Off a team view, nothing: an agent has no screen of its own since the per-agent
 * tab shell was deleted, so every other `viewMode` is a top-level view no agent
 * row belongs to.
 *
 * A COLLAPSED open team fills no agent row either, for the plainest reason
 * there is: the row is not rendered. Returning the pinned id would ask the rail
 * to light a row that does not exist — and the header takes the fill instead,
 * which is exactly what `teamRowActive` does with this answer.
 *
 * This is the FIRST half of the rail's one-fill rule: whatever it says, the
 * header says the opposite. It is asked first, and `teamRowActive` is handed
 * the result, so the two can never both light.
 */
export function sidebarSelectedAgentId(args: {
  viewMode: string;
  highlight: TeamHighlight;
  /** The team the highlight points at, `null` off a team view. */
  activeTeam: TeamView | null;
  /** That team's block is folded shut, so its agent rows are not drawn. */
  collapsed?: boolean;
}): string | null {
  if (args.viewMode !== TEAM_VIEW_ID) return null;
  if (args.collapsed === true) return null;
  const { agentId, section } = args.highlight;
  if (agentId === null || !sectionHonorsAgentPin(section)) return null;
  return args.activeTeam?.agents.some((a) => a.id === agentId) ? agentId : null;
}
