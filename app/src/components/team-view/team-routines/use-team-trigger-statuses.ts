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
  failures: AgentReadFailures;
  retry: () => void;
  retrying: boolean;
}

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
      if (failed) void statuses.refetch();
    },
    retrying: failed && statuses.isFetching,
  };
}
