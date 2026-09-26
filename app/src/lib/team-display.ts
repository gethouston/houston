import type { TeamView } from "./teams-model.ts";

export function teamDisplayName(team: TeamView): string {
  return team.name;
}

export function teamDisplayIcon(team: TeamView): string | undefined {
  return team.icon;
}

export function teamDisplayColor(team: TeamView): string | undefined {
  return team.color;
}
