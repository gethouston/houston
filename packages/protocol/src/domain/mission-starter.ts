export const MISSION_STARTERS = ["houston", "employee", "api"] as const;
export type MissionStarter = (typeof MISSION_STARTERS)[number];

export function isMissionStarter(value: unknown): value is MissionStarter {
  return MISSION_STARTERS.some((starter) => starter === value);
}
