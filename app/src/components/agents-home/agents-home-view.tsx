import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentMissionsScreen } from "./agent-missions-screen";
import { AgentsHomeList } from "./agents-home-list";

export function AgentsHomeView() {
  const drilledAgentId = useUIStore((s) => s.agentsHomeAgentId);
  const agent = useAgentStore((s) =>
    drilledAgentId === null
      ? null
      : (s.agents.find((a) => a.id === drilledAgentId) ?? null),
  );
  if (agent !== null)
    return <AgentMissionsScreen key={agent.id} agent={agent} />;
  return <AgentsHomeList />;
}
