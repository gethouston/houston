import type { TeamView } from "../../lib/teams-model.ts";

export function moveTargetTeams(
  teams: readonly TeamView[],
): (TeamView | null)[] {
  return [...teams, null];
}
