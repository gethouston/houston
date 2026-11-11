// Who started a mission (PRODUCT-1928). The host stamps it on the typed
// mission-creation routes from what it verified about the caller and never
// accepts it from a NewActivity body or a PATCH; a raw agent-file write or an
// archive import carries whatever the file holds (`Activity.started_by`).

/**
 * `houston`: the AI Manager started the mission or created the card.
 * `employee`: an AI Employee started it (on its own board or another's).
 * `api`: an external caller started it through the public API, MCP or A2A.
 */
export const MISSION_STARTERS = ["houston", "employee", "api"] as const;
export type MissionStarter = (typeof MISSION_STARTERS)[number];

export function isMissionStarter(value: unknown): value is MissionStarter {
  return MISSION_STARTERS.some((starter) => starter === value);
}
