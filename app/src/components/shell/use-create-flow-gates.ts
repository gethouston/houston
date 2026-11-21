import { useCanAddAgentsHere } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import { useAgentStore } from "../../stores/agents";
import type { CreateFlowGates } from "./create-agent-steps-model";

export function useCreateFlowGates(): CreateFlowGates {
  const { capabilities } = useCapabilities();
  const canCreateAgent = useCanAddAgentsHere();
  const agents = useAgentStore((s) => s.agents);

  return {
    canCreateAgent,
    canCreateTeam: true,
    canCopy: agents.some((agent) => isAgentManager(capabilities, agent)),
  };
}
