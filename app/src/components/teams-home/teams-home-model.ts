import type { Capabilities } from "@houston-ai/engine-client";
import {
  type TeamSectionId,
  visibleTeamSectionsForTeam,
} from "../../lib/team-sections.ts";
import type { TeamView } from "../../lib/teams-model.ts";

/**
 * The phone's Teams tree, as data: every team with its section rows indented
 * under it.
 *
 * The rows are the DESKTOP's own: the team strip's sections, in the strip's
 * order, with the same words — Tasks, Routines, Files, Team Settings. The
 * Team Settings row is the door the desktop has (Context, Agents, People and
 * Settings live BEHIND it, as tabs of the drilled level), so a phone user
 * finds each thing exactly where the desktop keeps it rather than a flattened
 * copy of the two levels.
 *
 * The list is re-asked here rather than trusted from anywhere: it is the same
 * gate the team view itself re-runs on every render, so the tree can never
 * offer a section the view would refuse.
 *
 * Pure, and unit-tested in `app/tests/teams-home-model.test.ts`.
 */

/** The tree's render order: the desktop strip's, with the board first. */
export const TEAM_SECTION_ORDER = [
  "mission-control",
  "routines",
  "files",
  "settings",
] as const satisfies readonly TeamSectionId[];

/** The sections the tree draws: the team's base level, nothing drilled. */
export type TeamTreeSectionId = (typeof TEAM_SECTION_ORDER)[number];

export interface TeamTreeSection {
  id: TeamTreeSectionId;
}

/** Where a row's tap lands: the section to open and whether it is the
 *  drilled Team Settings level. */
export interface TeamTreeTarget {
  section: TeamSectionId;
  teamSettingsFocus: boolean;
}

export interface TeamTreeRow {
  team: TeamView;
  sections: TeamTreeSection[];
}

export function teamTreeRows(
  teams: readonly TeamView[],
  caps: Capabilities | null,
): TeamTreeRow[] {
  return teams.map((team) => {
    const visible = new Set<TeamSectionId>(
      visibleTeamSectionsForTeam(caps, team),
    );
    const sections = TEAM_SECTION_ORDER.flatMap<TeamTreeSection>((id) =>
      visible.has(id) ? [{ id }] : [],
    );
    return { team, sections };
  });
}

/**
 * The desktop strip's own rule for its Team Settings lozenge: the door opens
 * the drilled level on its first tab, Context. Every other row opens its own
 * section on the team's base level.
 */
export function teamTreeTarget(section: TeamTreeSection): TeamTreeTarget {
  if (section.id === "settings")
    return { section: "context", teamSettingsFocus: true };
  return { section: section.id, teamSettingsFocus: false };
}
