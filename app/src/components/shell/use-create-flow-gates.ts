import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import { hasAgentTeams } from "../../lib/org-roles";
import { useAgentStore } from "../../stores/agents";
import type { CreateFlowGates } from "./create-agent-steps-model";

/**
 * What this user may add to their workspace, resolved once so the rail's "+"
 * and the sheet it opens can never disagree about which screens exist. A
 * control that offers a choice the sheet then skips is the same defect as a
 * sheet that offers one the user is not allowed to take.
 *
 * Creating a team is not an admin power on a server host: teams are how a
 * space organizes itself, so any member may add one. Copying needs an agent
 * whose content the caller may actually read — the gateway refuses a
 * "user"-access agent's portable preview, so it would be a door to an error.
 */
export function useCreateFlowGates(): CreateFlowGates {
  const { capabilities } = useCapabilities();
  const { canCreate: canCreateAgent } = useCanCreateAgents();
  const agents = useAgentStore((s) => s.agents);

  return {
    canCreateAgent,
    canCreateTeam: hasAgentTeams(capabilities) || canCreateAgent,
    canCopy: agents.some((agent) => isAgentManager(capabilities, agent)),
  };
}
