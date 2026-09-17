import type {
  AgentTeamMember,
  OrgMember,
  UsageRow,
} from "@houston/engine-adapter";

interface ChartAgent {
  id: string;
  folderPath: string;
}

export interface OrgChartUsage {
  byAgent: ReadonlyMap<string, number>;
  byPerson: ReadonlyMap<string, number>;
}

/** Only visible agents contribute to the chart: a row naming an agent this
 *  caller cannot see counts for nobody, agent or person. */
export function orgChartUsage(
  agents: readonly ChartAgent[],
  rows: readonly UsageRow[],
): OrgChartUsage {
  const canonical = new Map<string, string>();
  for (const agent of agents) {
    canonical.set(agent.id, agent.id);
    canonical.set(agent.folderPath, agent.id);
  }
  const byAgent = new Map(agents.map((agent) => [agent.id, 0]));
  const byPerson = new Map<string, number>();
  for (const row of rows) {
    const id = canonical.get(row.agentSlug);
    if (!id || !Number.isFinite(row.messages) || row.messages <= 0) continue;
    byAgent.set(id, (byAgent.get(id) ?? 0) + row.messages);
    byPerson.set(row.userId, (byPerson.get(row.userId) ?? 0) + row.messages);
  }
  return { byAgent, byPerson };
}

/** Default teams contain the workspace roster; named teams use real membership. */
export function orgChartMembers(args: {
  isDefault: boolean;
  personal: boolean;
  roster: readonly OrgMember[];
  members: readonly AgentTeamMember[];
}): OrgMember[] {
  const ids = new Set(args.members.map((member) => member.userId));
  const people =
    args.personal || args.isDefault
      ? args.roster
      : args.roster.filter((member) => ids.has(member.userId));
  return [...new Map(people.map((person) => [person.userId, person])).values()];
}
