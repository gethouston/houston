import type { Capabilities } from "@houston/engine-adapter";
import { isAgentManager } from "./agent-access.ts";
import type { Agent } from "./types.ts";

export type TeamSectionId =
  | "mission-control"
  | "routines"
  | "files"
  | "settings";

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

export function resolveTeamSection(
  sections: readonly TeamSectionId[],
  requested: TeamSectionId | null,
): TeamSectionId {
  return requested && sections.includes(requested) ? requested : sections[0];
}
