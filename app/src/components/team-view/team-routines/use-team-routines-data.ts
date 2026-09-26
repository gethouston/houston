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
  /** The employee's half-built routines, as their own rows. */
  drafts: RoutineDraft[];
  /** True until the routines and drafts reads first answer. */
  loading: boolean;
  /** The trigger props the grid needs, keyed by routine id. */
  triggers: TriggerSurface;
  /** Whether a read failed, for the inline strip. */
  failures: AgentReadFailures;
  /** Refetch ONLY the reads that failed. */
  retry: () => void;
  retrying: boolean;
}

/**
 * The employee's Routines section read, over the SAME query keys every other
 * routines read uses (`routinesQueryOptions` / `routineRunsQueryOptions`), so
 * the routines event invalidation refreshes it with everything else.
 *
 * Failures are never swallowed: the list renders what answered and the strip
 * names what did not, with retry scoped to the failed reads. Both routine
 * reads count: a runs failure leaves every row without its last-run line and
 * its stop-the-run action, which is a degraded row, not a whole one. The
 * drafts and trigger-health reads follow the same rules one file over and are
 * composed in here, so the view gets one list, one failure set and one retry.
 */
export function useTeamRoutinesData(agent: Agent): TeamRoutinesData {
  const routines = useQuery(routinesQueryOptions(agent.folderPath));
  const runs = useQuery(routineRunsQueryOptions(agent.folderPath));

  const list = useMemo(
    () => teamRoutinesList(routines.data, runs.data),
    [routines.data, runs.data],
  );
  const drafts = useTeamRoutineDrafts(agent, routines.data);
  // After the list: only an employee that owns an event routine is asked
  // about trigger health.
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
      // A row is only whole with both reads, so both go back out together.
      // Each refetch resolves with its outcome rather than rejecting, and a
      // second failure repaints the strip that offered this button.
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
