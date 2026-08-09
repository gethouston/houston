import type { Capabilities } from "@houston-ai/engine-client";
import { isAgentManager } from "./agent-access.ts";
import { canSeeTeamSettings } from "./team-permissions.ts";
import type { TeamView } from "./teams-model.ts";

/**
 * A team's SECTIONS: what a team block offers, which of them a caller may
 * reach, which one actually renders, and which of them narrow to the agent pin.
 *
 * Split out of `teams-model.ts` for the file-size rule and re-exported from it,
 * so every caller keeps importing the team model from one door. The import of
 * `TeamView` back from there is TYPE-ONLY, so nothing here closes a runtime
 * cycle (the same shape `team-permissions.ts` already uses).
 */

export type TeamSectionId =
  | "mission-control"
  | "routines"
  | "files"
  | "archived"
  | "settings";

/**
 * The sections THIS team offers this caller, in render order. The ONE list the
 * sidebar's section rows and the team view itself read, so a section can never
 * exist in the rail and be unreachable in the view (or the reverse). It is per
 * TEAM, not per caller: the same person may configure one team and only use the
 * next, so the rail asks it again for every block it draws.
 *
 * Mission Control, Routines, Files and Archived are every member's: they are
 * the team's WORK, and a member who may use the team's agents may see what
 * those agents do on their own, what they keep, and what they have finished
 * with. ARCHIVED is last before Settings because it is the team's work in the
 * past tense -- read it in order and the row goes present, recurring, kept,
 * done, then the one section that configures rather than shows. Team Settings
 * is the only section that
 * CONFIGURES rather than shows, so it goes to anyone who may configure
 * SOMETHING in this team: the org owner/admin (implicit owner of every team) or
 * a member who manages at least one of THIS team's agents. It is also the only
 * door to the agent settings page, so gating it org-wide would have taken every
 * configure surface away from an agent's own manager.
 *
 * On a SERVER-teams host the client-derived org-role half is REPLACED by the
 * server's own `owner` for this team: it already folds in the org owner/admin
 * (implicit owner of every team) and adds the explicit team owner, who
 * configures their team without being an org admin. The agent-manager clause is
 * untouched, so a member who manages one of the team's agents still gets in.
 */
export function visibleTeamSectionsForTeam(
  caps: Capabilities | null,
  team: TeamView,
): TeamSectionId[] {
  const configures =
    (team.server ? team.server.owner : canSeeTeamSettings(caps)) ||
    team.agents.some((agent) => isAgentManager(caps, agent));
  return [
    "mission-control",
    "routines",
    "files",
    "archived",
    ...(configures ? (["settings"] as const) : []),
  ];
}

/**
 * Whether a section actually narrows to the shared agent pin.
 *
 * The answer is now ONE section: the team's BOARD. The pin is what the rail
 * sets by clicking an agent, and the board is the only surface that shows what
 * that click means. Every other section either resolves its own agent (Files),
 * lists the whole team regardless (Manage agents), or carries a filter of its
 * OWN that belongs to the section rather than to the team (Routines, Archived
 * — a plain `useState` per mount, deliberately not this pin).
 *
 * That is why the rule is worth having at all: two surfaces read it to decide
 * whether to CLAIM a narrowing — the rail fills an agent row, and the team's
 * lozenge grows its second segment. Anywhere the pin does not narrow what is on
 * screen, both would assert something nothing is doing, and clicking the lit
 * row again would look like a no-op.
 *
 * The pin itself PERSISTS across every section — this rule is about what a
 * surface may claim, never about forgetting what the user chose. Opening
 * Routines and coming back to the board finds the board still pinned.
 */
export function sectionHonorsAgentPin(section: TeamSectionId | null): boolean {
  return section === "mission-control";
}

/**
 * The section the team view ACTUALLY renders: the requested one when this
 * caller can see it, else the team's first section (Mission Control). One rule
 * absorbs every stale-store case — no section chosen yet, and Team Settings
 * requested by someone whose role no longer allows it (a space switch demotes
 * them while the view is open).
 */
export function resolveTeamSection(
  sections: readonly TeamSectionId[],
  requested: TeamSectionId | null,
): TeamSectionId {
  return requested && sections.includes(requested) ? requested : sections[0];
}
