import { canDeleteTeam as mayDeleteTeam } from "./team-permissions.ts";
import type { TeamView } from "./teams-model.ts";

/**
 * What the UI SHOWS for one team: the identity it wears (name, mark, colour)
 * and the state its Delete row is drawn in.
 *
 * Its own module because `teams-model.ts` answers what a team IS — the shape,
 * the resolution from the stored layout, the lookups — while every rule here is
 * a RENDER-time question asked by a component holding an already-resolved
 * `TeamView`. The two are read by different callers (the rail's glyph, the
 * identity dialog and Team Settings read this one; the hooks and the view
 * guards read the model), and keeping the placeholder identity beside the
 * delete presentation is what lets a reader see the whole "how a team is
 * presented" surface at once.
 */

/** Localized display name without replacing the real name used by writes. */
export function teamDisplayName(team: TeamView, newTeamLabel: string): string {
  return team.usesDefaultIdentity ? newTeamLabel : team.name;
}

/**
 * The mark a team DISPLAYS: its stored icon, or the placeholder rocket while
 * it wears the untouched default identity. The one rule `TeamGlyph` draws and
 * the identity dialog seeds from, so the picker always opens showing exactly
 * the pair the rail is wearing.
 */
export function teamDisplayIcon(team: TeamView): string | undefined {
  return team.icon ?? (team.usesDefaultIdentity ? "rocket" : undefined);
}

/** The colour a team DISPLAYS — stored, or the placeholder charcoal. The twin
 *  of {@link teamDisplayIcon}, split only because callers store them apart. */
export function teamDisplayColor(team: TeamView): string | undefined {
  return team.color ?? (team.usesDefaultIdentity ? "charcoal" : undefined);
}

export type TeamDeletePresentation =
  | "disabled-only-team"
  | "enabled"
  | "hidden";

/** Settings keeps the sole team's Delete row visible but unavailable. */
export function teamDeletePresentation(
  teams: readonly TeamView[],
  team: TeamView,
): TeamDeletePresentation {
  if (teams.length === 1) return "disabled-only-team";
  return mayDeleteTeam(team) ? "enabled" : "hidden";
}
