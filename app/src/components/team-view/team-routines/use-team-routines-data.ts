import { useQueries, useQueryClient } from "@tanstack/react-query";
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
import { queryKeys } from "../../../lib/query-keys";
import type { Agent } from "../../../lib/types";
import type { TriggerSurface } from "../../agent/trigger-status-view-model";
import { teamFanOut } from "../team-fan-out";
import type { TeamRoutineDraftsList } from "../team-routine-drafts-model";
import {
  aggregateTeamRoutines,
  type TeamRoutinesList,
} from "../team-routines-model";

import { useTeamRoutineDrafts } from "./use-team-routine-drafts";
import { useTeamTriggerStatuses } from "./use-team-trigger-statuses";

export interface TeamRoutinesData {
  /** Every scoped agent's routines merged into ONE list (namespaced row keys). */
  list: TeamRoutinesList;
  /** Every scoped agent's half-built routines, as their own rows. */
  drafts: TeamRoutineDraftsList;
  /** True while ANY agent is still on its first answer — the grid's loading. */
  loading: boolean;
  /** The trigger props the grid needs, keyed by the merged list's row keys. */
  triggers: TriggerSurface;
  /** The agents that did NOT answer, for the inline strip. */
  failures: AgentReadFailures;
  /** Refetch ONLY the agents that failed. */
  retry: () => void;
  retrying: boolean;
}

/**
 * The team Routines section's read: a fan-out over the SAME per-agent query keys
 * every other routines read uses (`queryKeys.routines(path)` /
 * `queryKeys.routineRuns(path)`, built from the shared option factories). There
 * is deliberately NO aggregate key: an agent's routines have one cache entry, so
 * no two readers can serve different truths, the existing routines event
 * invalidation refreshes them all, and opening a team costs nothing for agents
 * whose lists are already warm.
 *
 * `refetchOnWindowFocus: false` is set per OBSERVER, here only. Alt-tabbing back
 * must not re-fan-out to every agent's pod (a pod-wake storm) nor fire one error
 * toast per unreachable agent. The open chat's own `useRoutines` observer
 * (`team-routine-panel.tsx`) keeps the default, so the surface a person is
 * actually working in still refreshes on focus.
 *
 * Every read is reduced through `teamFanOut` as `useQueries`' `combine`, so the
 * merge below is memoizable: React Query structurally shares the combined value
 * and an unchanged fleet hands back the SAME arrays. Without that the list was
 * rebuilt every render, and the shared trigger view model's memoized maps — and
 * the timeout that stops a trigger row saying "verifying" forever — re-armed
 * with it.
 *
 * Failures are never swallowed (no `.catch(() => [])`): the list renders what
 * answered and the caller names what did not, with retry scoped to those agents.
 * Both routine reads count — a runs-500 leaves every row without its last-run
 * line and its stop-the-run action, which is a degraded row, not a whole one.
 *
 * The section's other two reads — each agent's setup chats (its DRAFT routines)
 * and each agent's trigger health — follow the same rules one file over
 * (`use-team-routine-drafts.ts`, `use-team-trigger-statuses.ts`) and are
 * composed in here, so the view is handed one list, one set of failures and one
 * retry.
 */
export function useTeamRoutinesData(scoped: Agent[]): TeamRoutinesData {
  const queryClient = useQueryClient();

  const routines = useQueries({
    queries: scoped.map((agent) => ({
      ...routinesQueryOptions(agent.folderPath),
      refetchOnWindowFocus: false,
    })),
    combine: teamFanOut,
  });
  const runs = useQueries({
    queries: scoped.map((agent) => ({
      ...routineRunsQueryOptions(agent.folderPath),
      refetchOnWindowFocus: false,
    })),
    combine: teamFanOut,
  });

  const list = useMemo(
    () =>
      aggregateTeamRoutines(
        scoped.map((agent, i) => ({
          agent,
          routines: routines.data[i],
          runs: runs.data[i],
        })),
      ),
    [scoped, routines.data, runs.data],
  );

  const drafts = useTeamRoutineDrafts(scoped, routines.data);

  // The section's last read, composed here rather than in the view so there is
  // ONE place that says what "the team's routines" costs and ONE set of
  // failures to name. It has to come after the merge: which agents get asked
  // about trigger health is decided by which of them actually own an event
  // routine.
  const triggers = useTeamTriggerStatuses(scoped, list);

  const failures = mergeAgentReadFailures(
    mergeAgentReadFailures(
      agentReadFailures(
        scoped.map((agent, i) => ({
          agent,
          error: routines.errors[i] ?? runs.errors[i],
        })),
      ),
      drafts.failures,
    ),
    triggers.failures,
  );

  const failedIndexes = scoped
    .map((_, i) => i)
    .filter((i) => routines.errors[i] != null || runs.errors[i] != null);

  return {
    list,
    drafts: drafts.list,
    loading: routines.loading || drafts.loading,
    triggers,
    failures,
    retry: () => {
      for (const i of failedIndexes) {
        // `refetchQueries` resolves with the outcome rather than rejecting, and
        // a second failure repaints the strip that offered this button, so
        // there is no unhandled rejection and nothing is swallowed here. Both
        // reads go back out together: a row is only whole with both.
        const path = scoped[i].folderPath;
        void queryClient.refetchQueries({ queryKey: queryKeys.routines(path) });
        void queryClient.refetchQueries({
          queryKey: queryKeys.routineRuns(path),
        });
      }
      drafts.retry();
      triggers.retry();
    },
    retrying:
      triggers.retrying ||
      drafts.retrying ||
      failedIndexes.some((i) => routines.fetching[i] || runs.fetching[i]),
  };
}
