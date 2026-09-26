import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { agentTriggerStatusQueryOptions } from "../../../hooks/queries/use-triggers";
import {
  type AgentReadFailures,
  agentReadFailures,
} from "../../../lib/agent-read-failures";
import type { Agent } from "../../../lib/types";
import { triggerBoundRoutineIds } from "../../agent/routine-trigger-maps";
import {
  type TriggerSurface,
  useTriggerStatusViewModel,
} from "../../agent/trigger-status-view-model";
import type { TeamRoutinesList } from "../team-routines-model";

export interface TeamTriggerStatuses extends TriggerSurface {
  /** Whether trigger health could not be read, for the strip. */
  failures: AgentReadFailures;
  /** Refetch the trigger read when it failed. */
  retry: () => void;
  retrying: boolean;
}

/**
 * The employee's trigger health, over the key every trigger-health read uses
 * (`agentTriggerStatusQueryOptions`), fed to the shared view model.
 *
 * The grid renders a status chip for every row with a trigger binding, and a
 * row handed no status says "Verifying trigger…" until the view model's
 * timeout settles it, so this read has to run. It is enabled only while the
 * employee HAS an event routine, and the shared options carry the bounded
 * poll that lets a settling trigger settle. A failed read is named in the
 * section's one strip rather than toasted.
 */
export function useTeamTriggerStatuses(
  agent: Agent,
  list: TeamRoutinesList,
): TeamTriggerStatuses {
  const triggerRoutineIds = useMemo(
    () => triggerBoundRoutineIds(list.routines),
    [list.routines],
  );
  const statuses = useQuery({
    ...agentTriggerStatusQueryOptions(agent.id, triggerRoutineIds),
    enabled: triggerRoutineIds.length > 0,
  });
  const surface = useTriggerStatusViewModel(list.routines, statuses.data);
  const failed = statuses.error != null;

  return {
    ...surface,
    failures: agentReadFailures([{ agent, error: statuses.error }]),
    retry: () => {
      // Resolves with the outcome rather than rejecting; a second failure
      // repaints the strip that offered the retry.
      if (failed) void statuses.refetch();
    },
    retrying: failed && statuses.isFetching,
  };
}
