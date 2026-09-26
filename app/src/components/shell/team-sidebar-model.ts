import type { SidebarLayout } from "@houston/engine-adapter";
import type { TeamView } from "../../lib/teams-model.ts";

export function teamCollapsedLookup(
  layout: SidebarLayout,
): (team: TeamView) => boolean {
  const byId = new Map(
    layout.groups.map((group) => [group.id, group.collapsed]),
  );
  return (team) => byId.get(team.id) ?? false;
}
