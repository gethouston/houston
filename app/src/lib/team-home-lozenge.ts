/**
 * What clicking the team's own lozenge does.
 *
 * The team strip's first lozenge IS the team: its glyph, its name, and — while
 * an agent is pinned — that agent after a chevron. It is also the Tasks
 * destination, which is why the word "Tasks" appears nowhere in the chrome:
 * the team's board is not a section beside the team, it is what the team looks
 * like when you are looking at it.
 *
 * That makes one control answer three questions, exactly as the rail's team
 * header does (`team-header-click.ts`). The two are deliberately the SAME
 * grammar on two surfaces: a user who learns what clicking a team's name does
 * in the rail has learned what it does on the strip.
 *
 * Pure, and tested arm by arm, because "what does clicking this do" depends on
 * two moving values at once and each arm is invisible from the others.
 */

import { TEAM_HOME_SECTION } from "./team-header-click.ts";
import type { TeamSectionId } from "./teams-model.ts";

/**
 * The one move the click makes. Three arms, disjoint and exhaustive, each
 * naming the whole act so a caller cannot execute half of one.
 */
export type TeamHomeLozengeClick =
  /**
   * Somewhere else in this team (Routines, Files, Archived, focused agent screen):
   * go to the board. The agent pin RIDES ALONG, like every other tab click —
   * someone looking at Kai's routines means Kai's tasks when they click here.
   */
  | { kind: "open" }
  /**
   * Already on the board, narrowed to one agent: widen back to the whole team.
   * This is the lozenge undoing its own second segment, and it is the only way
   * back to the whole team from the strip — the segment is state, not a menu.
   */
  | { kind: "clear-pin" }
  /**
   * Already on the board, already whole: nothing to do. Answered explicitly
   * rather than by falling through, so "the click did nothing" is a decision
   * the caller can see rather than an accident of ordering.
   */
  | { kind: "none" };

export interface TeamHomeLozengeInput {
  /** The section actually on screen, null off a team view. */
  section: TeamSectionId | null;
  /** The shared agent pin (`teamAgentFilter`), null for the whole team. */
  pinnedAgentId: string | null;
}

/**
 * The three arms, in the order they are asked:
 *
 * 1. not on the board → `open` (pin rides along);
 * 2. on the board, pinned → `clear-pin`;
 * 3. on the board, unpinned → `none`.
 *
 * A null `section` is read as "not on the board", which is the same answer:
 * navigating somewhere real beats doing nothing over a screen we could not
 * name.
 */
export function teamHomeLozengeClick({
  section,
  pinnedAgentId,
}: TeamHomeLozengeInput): TeamHomeLozengeClick {
  if (section !== TEAM_HOME_SECTION) return { kind: "open" };
  if (pinnedAgentId !== null) return { kind: "clear-pin" };
  return { kind: "none" };
}

/**
 * Whether the home lozenge wears the active state: exactly when the board is
 * the section on screen. It does NOT also light for a pinned agent — the pin
 * is a narrowing of this destination, not a different one.
 */
export function teamHomeLozengeActive(section: TeamSectionId | null): boolean {
  return section === TEAM_HOME_SECTION;
}
