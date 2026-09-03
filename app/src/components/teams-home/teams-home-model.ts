import type { Capabilities } from "@houston-ai/engine-client";
import {
  type TeamSectionId,
  teamPeopleFace,
  visibleTeamSectionsForTeam,
  visibleTeamSettingsSections,
} from "../../lib/team-sections.ts";
import type { TeamView } from "../../lib/teams-model.ts";

/**
 * The phone's Teams tree, as data: every team with the section rows indented
 * under it.
 *
 * The tree FLATTENS two levels the desktop keeps apart — a team's own sections
 * and the drilled Team Settings level behind its Settings door — because on a
 * phone a tap should land on the thing, not on another chrome row that then
 * offers it. So each row carries {@link TeamTreeSection.settingsLevel}: which
 * of the two lists it came from, which is exactly the `teamSettingsFocus` the
 * store write needs.
 *
 * Both lists are re-asked here rather than trusted from anywhere: they are the
 * same gates the team view itself re-runs on every render, so the tree can
 * never offer a section the view would refuse.
 *
 * Pure, and unit-tested in `app/tests/teams-home-model.test.ts`.
 */

/**
 * The tree's fixed render order. NOT the order either source list uses: the
 * user reads one list of six, so the team's shared surfaces (Tasks, Routines,
 * Context, People, Files) come before the row that configures the team.
 *
 * `agents` is deliberately absent. The settings level offers it, but the phone
 * reaches an agent through the Agents tab, so a second door into the roster
 * here would only compete with it.
 */
export const TEAM_SECTION_ORDER = [
  "mission-control",
  "routines",
  "context",
  "people",
  "files",
  "settings",
] as const satisfies readonly TeamSectionId[];

/** The sections the tree draws — every `TeamSectionId` except `agents`. */
export type TeamTreeSectionId = (typeof TEAM_SECTION_ORDER)[number];

/**
 * The rows that live BEHIND the Settings door on the desktop, so their store
 * write carries `teamSettingsFocus` and their visibility is decided by
 * {@link visibleTeamSettingsSections} rather than the team's base list.
 */
const SETTINGS_LEVEL: ReadonlySet<TeamTreeSectionId> = new Set([
  "context",
  "people",
  "settings",
]);

export interface TeamTreeSection {
  id: TeamTreeSectionId;
  /** Open it with `teamSettingsFocus: true` — it lives in the drilled level. */
  settingsLevel: boolean;
}

export interface TeamTreeRow {
  team: TeamView;
  sections: TeamTreeSection[];
}

export function teamTreeRows(
  teams: readonly TeamView[],
  caps: Capabilities | null,
  space: { personalSpace: boolean; spacesHost: boolean },
): TeamTreeRow[] {
  return teams.map((team) => {
    const face = teamPeopleFace(team, space.personalSpace, space.spacesHost);
    const base = new Set<TeamSectionId>(visibleTeamSectionsForTeam(caps, team));
    const drilled = new Set<TeamSectionId>(
      visibleTeamSettingsSections(caps, team, face),
    );
    const sections = TEAM_SECTION_ORDER.flatMap<TeamTreeSection>((id) => {
      const settingsLevel = SETTINGS_LEVEL.has(id);
      const visible = settingsLevel ? drilled.has(id) : base.has(id);
      return visible ? [{ id, settingsLevel }] : [];
    });
    return { team, sections };
  });
}
