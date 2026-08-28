import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentMissionsScreen } from "./agent-missions-screen";
import { AgentsHomeList } from "./agents-home-list";

/**
 * The mobile Agents home, the Agents tab's root screen: the agent list, or —
 * drilled through `agentsHomeAgentId` (a nav-stack level, so back pops it) —
 * one agent's missions. The drill target rides the id, not an object, so an
 * agent deleted (or a roster reload landing mid-drill) falls back to the list
 * instead of rendering a ghost.
 */
export function AgentsHomeView() {
  const drilledAgentId = useUIStore((s) => s.agentsHomeAgentId);
  const agent = useAgentStore((s) =>
    drilledAgentId === null
      ? null
      : (s.agents.find((a) => a.id === drilledAgentId) ?? null),
  );
  if (agent !== null) return <AgentMissionsScreen agent={agent} />;
  return <AgentsHomeList />;
}
