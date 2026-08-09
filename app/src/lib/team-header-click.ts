/**
 * What clicking a team's name in the rail does.
 *
 * A team block is a header row and its agent rows — nothing else. The header is
 * therefore the ONE hit target a team has, and it has to answer five different
 * questions depending on where the user already is. The triangle beside the
 * name states the fold and does not take clicks of its own: it is an indicator,
 * so there is never a second control on the row promising a different outcome.
 *
 * (An AGENT row is the simple one and needs no rule: it always opens its team's
 * Tasks board with itself pinned. Tasks is a team's home, and the surfaces that
 * once argued for staying put are going away — Files is being redesigned as
 * agents-as-folders, with no agent selection to carry.)
 *
 * Pure, and tested arm by arm, because "what does clicking this do" is the
 * rail's whole contract and it depends on four moving values at once.
 */

import type { TeamSectionId } from "./team-sections.ts";

/** The team screen's first section — what a team OPENS on. */
const TEAM_HOME_SECTION: TeamSectionId = "mission-control";

/**
 * The one move a click on a team's NAME makes. Five arms, no combinations:
 * each names both halves (navigate, fold) so a caller cannot execute half of
 * one.
 */
export type TeamHeaderClick =
  /**
   * Arriving from somewhere else: open this team's Tasks, unfold it, and fold
   * every OTHER team. An accordion, because a rail of eight expanded teams is
   * a list of agents with headings in it, and the one team the user just asked
   * for is the only one whose members are worth the rail right now.
   */
  | { kind: "open-solo" }
  /**
   * Already in this team, on one of its other sections: come back to Tasks.
   * Folds are left exactly as they are — the user did not ask about the rail,
   * they asked for the board, and folding on the way would move rows out from
   * under the cursor.
   */
  | { kind: "open" }
  /**
   * Already on this team's Tasks, narrowed to one of its agents: widen back to
   * the whole team. The team's name IS the "all agents" row, so clicking it
   * from a filtered board is the plainest way to say "show me everything
   * again" — and it must come before the fold, because a click that folded the
   * block would leave the board still filtered by a pin whose row is now
   * hidden.
   */
  | { kind: "clear-pin" }
  /**
   * On this team's Tasks, unfiltered and open: fold it. The rail folds and the
   * SCREEN STAYS, which is deliberate — the header keeps the active pill and
   * its rollup badge, so a folded block is still saying where the user is and
   * what its agents need.
   */
  | { kind: "collapse" }
  /** On this team's Tasks, folded: unfold it, screen unchanged. */
  | { kind: "expand" };

export interface TeamHeaderClickInput {
  /** The block that was clicked. */
  teamId: string;
  /** That block is folded shut. */
  collapsed: boolean;
  /** The team the open view belongs to (`TeamHighlight.teamId`), null off a
   *  team view. */
  activeTeamId: string | null;
  /** The section actually on screen (`TeamHighlight.section`), null off a team
   *  view. */
  section: TeamSectionId | null;
  /**
   * An agent row in this block is LIT — the board on screen really is narrowed
   * to one of this team's agents (`sidebarSelectedAgentId`), not merely a stale
   * id sitting in the store. A pin nothing is applying must not steal the
   * click: clearing it would look like a broken button.
   */
  agentPinned: boolean;
}

/**
 * The five arms, in the order they are asked:
 *
 * 1. not in this team (including on no team at all) → `open-solo`;
 * 2. in this team, on another section → `open`;
 * 3. on this team's Tasks, folded → `expand`;
 * 4. on this team's Tasks, open, narrowed to an agent → `clear-pin`;
 * 5. on this team's Tasks, open, unfiltered → `collapse`.
 *
 * The fold is asked BEFORE the pin because a folded block draws no agent rows:
 * there is no filtered row on screen to widen away from, and the one thing the
 * user can want from a folded block is to see inside it.
 *
 * A null `section` with this team active cannot come out of
 * `resolveTeamHighlight` (it nulls the team id too), and it is read as "not on
 * Tasks" anyway: navigating somewhere real beats folding a block over a screen
 * we could not name.
 */
export function teamHeaderClick({
  teamId,
  collapsed,
  activeTeamId,
  section,
  agentPinned,
}: TeamHeaderClickInput): TeamHeaderClick {
  if (activeTeamId !== teamId) return { kind: "open-solo" };
  if (section !== TEAM_HOME_SECTION) return { kind: "open" };
  if (collapsed) return { kind: "expand" };
  return agentPinned ? { kind: "clear-pin" } : { kind: "collapse" };
}

/** The section every arm that navigates opens. Exported so the caller cannot
 *  pick a different one and quietly disagree with the rule above. */
export { TEAM_HOME_SECTION };
