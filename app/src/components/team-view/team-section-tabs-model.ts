import type { TeamSectionId } from "../../lib/teams-model.ts";

/**
 * The team strip's lozenges that need a WORD, as data.
 *
 * The rail no longer draws a team's sections, so the strip is the only way
 * from one section of a team to another. Its contents are
 * `visibleTeamSectionsForTeam(caps, team)` in order, MINUS the board: the
 * board's lozenge is the team itself (glyph, name, and the pinned agent), so
 * it carries no label of its own and the word "Tasks" appears nowhere in the
 * chrome. One list still decides what a team offers this caller, and both the
 * strip and the view behind it read it, so a lozenge can never open a section
 * the view refuses to render (or hide one it would).
 *
 * The mapping is an exhaustive `Record`, so adding a `TeamSectionId` without
 * naming it is a compile error rather than a tab with a blank label.
 *
 * Pure, and unit-tested in `app/tests/team-section-tabs-model.test.ts`.
 */

/**
 * The four label keys, as literals rather than `string`: `t()` is typed against
 * the locale files, so a key that does not exist is a compile error here
 * instead of a tab reading as its own key on screen.
 */
export type TeamSectionTabKey =
  /** Used ONLY by the compact switcher's menu, never as a lozenge label: a
   *  list of section names has to name the board too. */
  | "teamView.tabs.missionControl"
  | "teamView.tabs.routines"
  | "teamView.tabs.files";

/** One lozenge: the section it opens, and the `teams` i18n key it reads as. */
export interface TeamSectionTab {
  id: LabelledTeamSectionId;
  labelKey: TeamSectionTabKey;
}

/** Every section EXCEPT the board, which the team's own lozenge stands for. */
export type LabelledTeamSectionId = "routines" | "files";

/**
 * Section id -> its label key in the `teams` namespace. Exhaustive over the
 * labelled sections, so adding a `TeamSectionId` without naming it is still a
 * compile error rather than a lozenge with a blank label. The words live here
 * rather than the retired `shell:sidebar.teamSections.*` keys, which named rail rows,
 * which no longer exist, and a label the rail does not draw has no business
 * living in the rail's namespace.
 */
export const TEAM_SECTION_TAB_KEYS: Record<
  LabelledTeamSectionId,
  TeamSectionTabKey
> = {
  routines: "teamView.tabs.routines",
  files: "teamView.tabs.files",
};

/**
 * The labelled lozenges for a team, straight off its visible sections. The
 * board is dropped: the team's own lozenge leads the cluster and stands for it.
 */
export function teamSectionTabs(
  sections: readonly TeamSectionId[],
): TeamSectionTab[] {
  return sections
    .filter((id): id is LabelledTeamSectionId => id in TEAM_SECTION_TAB_KEYS)
    .map((id) => ({ id, labelKey: TEAM_SECTION_TAB_KEYS[id] }));
}
