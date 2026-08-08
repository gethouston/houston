import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  agentTriggerStatusQueryKey,
  agentTriggerStatusQueryOptions,
} from "../../../hooks/queries/use-triggers";
import {
  type AgentReadFailures,
  agentReadFailures,
} from "../../../lib/agent-read-failures";
import type { Agent } from "../../../lib/types";
import {
  type TriggerSurface,
  useTriggerStatusViewModel,
} from "../../tabs/trigger-status-view-model";
import { teamFanOut } from "../team-fan-out";
import {
  type TeamRoutinesList,
  teamTriggerRoutineIds,
  teamTriggerStatusItems,
} from "../team-routines-model";

export interface TeamTriggerStatuses extends TriggerSurface {
  /** The agents whose trigger health could not be read, for the strip. */
  failures: AgentReadFailures;
  /** Refetch ONLY the agents whose trigger read failed. */
  retry: () => void;
  retrying: boolean;
}

/**
 * The team Routines section's trigger read: a fan-out over the SAME per-agent
 * key the Automations tab uses (`["agent-trigger-status", <agentId>]`, built
 * from `agentTriggerStatusQueryOptions`), then the SAME view model the tab runs
 * (`useTriggerStatusViewModel`).
 *
 * This exists because the merged grid renders `RoutineTriggerStatus` for every
 * row with a trigger binding, and a row handed no status resolves to the muted
 * "Verifying trigger…" chip — forever. A cross-agent list that cannot resolve
 * that chip is making a claim it can never settle, so it has to run the whole
 * per-agent machinery, timeout included.
 *
 * Three rules the fan-out keeps:
 *
 * - **No aggregate key.** One agent's trigger status has ONE cache entry, so the
 *   tab and this list can never serve different truths and opening a team costs
 *   nothing for agents already warm.
 * - **Enabled per agent only when that agent HAS an event routine** — the exact
 *   rule the tab applies. A workspace with no event routines makes zero extra
 *   requests. The bounded poll (`triggerStatusPollInterval`, inside the shared
 *   options) rides along: it is what makes a settling trigger settle, and it
 *   stops once every trigger has, so it is not a storm.
 * - **No toast, ever.** `useAgentTriggerStatus` toasts through
 *   `useQueryErrorToast`; N agents would become N toasts. Nothing is swallowed
 *   though: a failed read is NAMED, folded into the section's existing
 *   `AgentReadsFailed` strip rather than a second strip of its own, because
 *   "Houston could not read this agent" is the same fact whichever of the
 *   section's reads produced it, and retry is the loud user-initiated path.
 *
 * `refetchOnWindowFocus: false` is set per observer here, like the section's
 * other fan-outs, and the results are reduced through `teamFanOut` for the same
 * reason: the shared view model memoizes on the items it is handed, and a fresh
 * array every render would re-arm its verification timeout every render.
 */
export function useTeamTriggerStatuses(
  scoped: Agent[],
  list: TeamRoutinesList,
): TeamTriggerStatuses {
  const queryClient = useQueryClient();
  const idsByAgent = teamTriggerRoutineIds(list);

  const statuses = useQueries({
    queries: scoped.map((agent) => {
      const triggerRoutineIds = idsByAgent[agent.id] ?? [];
      return {
        ...agentTriggerStatusQueryOptions(agent.id, triggerRoutineIds),
        enabled: triggerRoutineIds.length > 0,
        refetchOnWindowFocus: false,
      };
    }),
    combine: teamFanOut,
  });

  // The grid's rows are namespaced (`teamRoutineKey`), so the host's answers are
  // translated into that space before the shared view model sees them.
  const items = useMemo(
    () =>
      teamTriggerStatusItems(
        scoped.map((agent, i) => ({
          agentId: agent.id,
          items: statuses.data[i],
        })),
      ),
    [scoped, statuses.data],
  );
  const surface = useTriggerStatusViewModel(list.routines, items);

  const failedIndexes = scoped
    .map((_, i) => i)
    .filter((i) => statuses.errors[i] != null);

  return {
    ...surface,
    failures: agentReadFailures(
      scoped.map((agent, i) => ({ agent, error: statuses.errors[i] })),
    ),
    retry: () => {
      for (const i of failedIndexes) {
        // `refetchQueries` resolves with the outcome rather than rejecting, and
        // a second failure repaints the strip that offered this button, so
        // there is no unhandled rejection and nothing is swallowed here.
        void queryClient.refetchQueries({
          queryKey: agentTriggerStatusQueryKey(scoped[i].id),
        });
      }
    },
    retrying: failedIndexes.some((i) => statuses.fetching[i]),
  };
}
