import type { StoreAgentSummary } from "@houston/agentstore-client";
import { AgentCard } from "./agent-card";

export interface AgentGridProps {
  agents: StoreAgentSummary[];
  /** Maps a category slug to its display label (from the categories table). */
  categoryLabels?: Map<string, string>;
}

/** Responsive grid of agent cards. Empty handling lives with the caller. */
export function AgentGrid({ agents, categoryLabels }: AgentGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <li key={agent.id}>
          <AgentCard
            agent={agent}
            categoryLabel={categoryLabels?.get(agent.category)}
          />
        </li>
      ))}
    </ul>
  );
}
