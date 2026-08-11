import type { Capabilities } from "@houston-ai/engine-client";
import { isAgentManager } from "./agent-access.ts";
import { canConfigureTeam } from "./team-permissions.ts";
import type { TeamView } from "./teams-model.ts";
import type { Agent } from "./types.ts";

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
  | "settings"
  | "agents"
  | "context"
  | "people";

export type TeamPeopleFace = "roster" | "invite" | "hidden";

export function teamPeopleFace(
  team: TeamView,
  personalSpace: boolean,
  spacesHost: boolean,
): TeamPeopleFace {
  if (team.server !== undefined && !personalSpace) return "roster";
  if (personalSpace && spacesHost) return "invite";
  return "hidden";
}

/**
 * The sections THIS team offers this caller, in render order. The ONE list the
 * sidebar's section rows and the team view itself read, so a section can never
 * exist in the rail and be unreachable in the view (or the reverse). It is per
 * TEAM, not per caller: the same person may configure one team and only use the
 * next, so the rail asks it again for every block it draws.
 *
 * Mission Control, Routines and Files are every member's work. Settings is a
 * manager-only door into the team's configuration level.
 *
 * On a SERVER-teams host the client-derived org-role half of that gate is
 * REPLACED by the server's own `owner` for this team: it already folds in the
 * org owner/admin and adds the explicit team owner, who configures their team
 * without being an org admin.
 */
export function visibleTeamSectionsForTeam(
  caps: Capabilities | null,
  team: TeamView,
  _peopleFace: TeamPeopleFace = "hidden",
): TeamSectionId[] {
  const manager = canConfigureTeam(caps, team);
  return [
    "mission-control",
    "routines",
    "files",
    ...(manager ? (["settings"] as const) : []),
  ];
}

/** The drilled Team Settings level. People is deliberately present for every
 * manager; its body chooses roster or invite from the deployment face. */
export function visibleTeamSettingsSections(
  _team: TeamView,
  _peopleFace: TeamPeopleFace,
): TeamSectionId[] {
  return ["context", "agents", "people", "settings"];
}

export function visibleAgentSections(
  caps: Capabilities | null,
  agent: Pick<Agent, "access">,
): TeamSectionId[] {
  return [
    "mission-control",
    "routines",
    "files",
    ...(isAgentManager(caps, agent) ? (["settings"] as const) : []),
  ];
}

/**
 * Whether a section actually narrows to the shared agent pin.
 *
 * The answer is one section: the team's board. Agent focus is tracked
 * separately, so its Routines, Files, and Settings screens can keep the rail
 * agent selected without claiming that the board pin narrows them.
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
