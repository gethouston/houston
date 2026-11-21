import { useQueries } from "@tanstack/react-query";
import type { Config } from "../../data/config";
import { agentConfigQueryOptions } from "../../hooks/queries/use-agent-config";
import { useCapabilities } from "../../hooks/use-capabilities";
import { canEditAgentConfig } from "../../lib/agent-access";
import { warmingIsCreation } from "../../lib/agent-provisioning/entry";
import type { Agent } from "../../lib/types";
import { useAgentProvisioningStore } from "../../stores/agent-provisioning";
import {
  type FirstDayPlacement,
  firstDayConfigsSettled,
  firstDayHoldsAutoOpen,
  firstDayPlacement,
  pendingFirstDayAgents,
} from "./first-day-model";

export interface FirstDayBoardState {
  placement: FirstDayPlacement<Agent>;
  holdsAutoOpen: boolean;
}

export function useFirstDayPlacement({
  agents,
  pinnedAgent,
  pinnedTaskCount,
}: {
  agents: Agent[];
  pinnedAgent: Agent | null;
  pinnedTaskCount: number;
}): FirstDayBoardState {
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const canStart = (agent: Agent) => canEditAgentConfig(capabilities, agent);
  const startable = agents.filter(canStart);
  const configs = useQueries({
    queries: startable.map((agent) =>
      agentConfigQueryOptions(agent.folderPath),
    ),
  });
  const anyCreating = useAgentProvisioningStore((s) =>
    Object.values(s.provisioning).some(
      (entry) =>
        warmingIsCreation(entry) &&
        startable.some((agent) => agent.folderPath === entry.agentPath),
    ),
  );
  const settled = firstDayConfigsSettled({
    capabilitiesLoading,
    configsPending: configs.some((q) => q.isPending),
    anyCreating,
  });
  const byPath = new Map<string, Config | undefined>(
    startable.map((agent, i) => [agent.folderPath, configs[i]?.data]),
  );
  const pending = pendingFirstDayAgents(
    agents,
    (path) => byPath.get(path),
    canStart,
  );
  const placement = firstDayPlacement({
    pinnedAgent,
    pending,
    pinnedTaskCount,
  });
  return {
    placement,
    holdsAutoOpen: firstDayHoldsAutoOpen(settled, placement),
  };
}
