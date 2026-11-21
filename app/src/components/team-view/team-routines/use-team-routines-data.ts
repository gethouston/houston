import type { RoutineDraft } from "@houston-ai/routines";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  routineRunsQueryOptions,
  routinesQueryOptions,
} from "../../../hooks/queries";
import {
  type AgentReadFailures,
  agentReadFailures,
  mergeAgentReadFailures,
} from "../../../lib/agent-read-failures";
import type { Agent } from "../../../lib/types";
import type { TriggerSurface } from "../../agent/trigger-status-view-model";
import {
  type TeamRoutinesList,
  teamRoutinesList,
} from "../team-routines-model";
import { useTeamRoutineDrafts } from "./use-team-routine-drafts";
import { useTeamTriggerStatuses } from "./use-team-trigger-statuses";

export interface TeamRoutinesData {
  list: TeamRoutinesList;
  drafts: RoutineDraft[];
  loading: boolean;
  triggers: TriggerSurface;
  failures: AgentReadFailures;
  retry: () => void;
  retrying: boolean;
}

export function useTeamRoutinesData(agent: Agent): TeamRoutinesData {
  const routines = useQuery(routinesQueryOptions(agent.folderPath));
  const runs = useQuery(routineRunsQueryOptions(agent.folderPath));

  const list = useMemo(
    () => teamRoutinesList(routines.data, runs.data),
    [routines.data, runs.data],
  );
  const drafts = useTeamRoutineDrafts(agent, routines.data);
  const triggers = useTeamTriggerStatuses(agent, list);

  const routinesFailed = routines.error != null || runs.error != null;
  const failures = mergeAgentReadFailures(
    mergeAgentReadFailures(
      agentReadFailures([{ agent, error: routines.error ?? runs.error }]),
      drafts.failures,
    ),
    triggers.failures,
  );

  return {
    list,
    drafts: drafts.list,
    loading: routines.isLoading || drafts.loading,
    triggers,
    failures,
    retry: () => {
      if (routinesFailed) {
        void routines.refetch();
        void runs.refetch();
      }
      drafts.retry();
      triggers.retry();
    },
    retrying:
      triggers.retrying ||
      drafts.retrying ||
      (routinesFailed && (routines.isFetching || runs.isFetching)),
  };
}
