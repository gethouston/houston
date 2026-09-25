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
  /** The board's empty auto-open waits (see `firstDayHoldsAutoOpen`). */
  holdsAutoOpen: boolean;
}

/**
 * The first-day offer a board shows, read off each shown employee's config.
 *
 * The reads are `useAgentConfig`'s own query options, so they are the same
 * cache entries the rest of the app keeps warm, and the config event
 * invalidation flips the offer away the moment a first day is recorded,
 * whoever recorded it.
 */
export function useFirstDayPlacement({
  agents,
  pinnedAgent,
  pinnedTaskCount,
}: {
  /** The employees the board shows: the pinned one, or the whole team. */
  agents: Agent[];
  pinnedAgent: Agent | null;
  pinnedTaskCount: number;
}): FirstDayBoardState {
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const canStart = (agent: Agent) => canEditAgentConfig(capabilities, agent);
  // Only the employees this user may start need their config read.
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
  // A failed read counts as settled with no offer: a board must not hold its
  // composer forever over one unreadable config.
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
