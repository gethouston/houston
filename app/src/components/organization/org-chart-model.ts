import type { UsageRow } from "@houston/engine-adapter";

interface ChartAgent {
  id: string;
  folderPath: string;
}

export interface OrgChartUsage {
  byAgent: ReadonlyMap<string, number>;
}

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
  for (const row of rows) {
    const id = canonical.get(row.agentSlug);
    if (!id || !Number.isFinite(row.messages) || row.messages <= 0) continue;
    byAgent.set(id, (byAgent.get(id) ?? 0) + row.messages);
  }
  return { byAgent };
}
