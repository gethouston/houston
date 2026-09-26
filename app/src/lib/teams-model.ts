import type { SidebarLayout } from "@houston/engine-adapter";
import { resolveSidebarSections } from "./agent-order.ts";
import type { Agent } from "./types.ts";

export {
  resolveTeamSection,
  type TeamSectionId,
  visibleAgentSections,
} from "./team-sections.ts";

export const AGENT_VIEW_ID = "agent";

export interface TeamView {
  id: string;
  name: string;
  agents: Agent[];
  icon?: string;
  color?: string;
}

export function resolveTeams(
  agents: Agent[],
  layout: SidebarLayout,
): TeamView[] {
  const { groups } = resolveSidebarSections(agents, layout);
  return groups.map(({ group, agents: members }) => ({
    id: group.id,
    name: group.name,
    agents: members,
    ...(group.icon === undefined ? {} : { icon: group.icon }),
    ...(group.color === undefined ? {} : { color: group.color }),
  }));
}

export function teamById(
  teams: TeamView[],
  id: string | null,
): TeamView | null {
  if (id === null) return null;
  return teams.find((team) => team.id === id) ?? null;
}

export function teamOfAgent(
  teams: TeamView[],
  agentId: string,
): TeamView | null {
  return (
    teams.find((team) => team.agents.some((agent) => agent.id === agentId)) ??
    null
  );
}

export function blockedAgentView(
  viewMode: string,
  activeAgentId: string | null,
  agents: readonly Agent[],
): boolean {
  return (
    viewMode === AGENT_VIEW_ID &&
    !agents.some((agent) => agent.id === activeAgentId)
  );
}
