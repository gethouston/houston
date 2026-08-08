import type { Routine } from "@houston-ai/engine-client";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { activityQueryOptions } from "../../../hooks/queries";
import {
  type AgentReadFailures,
  agentReadFailures,
} from "../../../lib/agent-read-failures";
import { queryKeys } from "../../../lib/query-keys";
import type { Agent } from "../../../lib/types";
import { teamFanOut } from "../team-fan-out";
import {
  aggregateTeamRoutineDrafts,
  type TeamRoutineDraftsList,
} from "../team-routine-drafts-model";

export interface TeamRoutineDrafts {
  list: TeamRoutineDraftsList;
  /** No agent has answered its activity read yet. */
  loading: boolean;
  /** The agents whose setup chats could not be read, for the strip. */
  failures: AgentReadFailures;
  /** Refetch ONLY the agents whose activity read failed. */
  retry: () => void;
  retrying: boolean;
}

/**
 * The team Routines section's DRAFT read: a fan-out over the SAME per-agent
 * activity key the board uses (`queryKeys.activity(path)`, from the shared
 * `activityQueryOptions`).
 *
 * It exists because a routine being built in chat is not a routine yet — it is
 * an unclaimed setup ACTIVITY, invisible to every routines read. The list has to
 * carry those as their own resumable rows, or a routine started from this
 * surface vanishes from the list the moment the person looks away from its
 * chat, under a grid still saying nothing runs on its own yet.
 *
 * Same three rules as the section's other fan-outs: no aggregate key (so the
 * tab and this list share one cache entry and one invalidation),
 * `refetchOnWindowFocus: false` per observer (an alt-tab must not re-sweep
 * every pod), and failures NAMED rather than swallowed — folded into the
 * section's one strip, with retry scoped to the agents that failed.
 */
export function useTeamRoutineDrafts(
  scoped: Agent[],
  /** Each scoped agent's routines, in the same order — a draft is a setup chat
   *  NO routine has claimed, so the claim check needs them. */
  routines: (Routine[] | undefined)[],
): TeamRoutineDrafts {
  const queryClient = useQueryClient();

  const activities = useQueries({
    queries: scoped.map((agent) => ({
      ...activityQueryOptions(queryClient, agent.folderPath),
      refetchOnWindowFocus: false,
    })),
    combine: teamFanOut,
  });

  // Memoized on the fan-out's structurally-shared data (see `team-fan-out.ts`),
  // so the grid's draft rows keep their identity between renders.
  const list = useMemo(
    () =>
      aggregateTeamRoutineDrafts(
        scoped.map((agent, i) => ({
          agent,
          activities: activities.data[i],
          routines: routines[i],
        })),
      ),
    [scoped, activities.data, routines],
  );

  const failedIndexes = scoped
    .map((_, i) => i)
    .filter((i) => activities.errors[i] != null);

  return {
    list,
    loading: activities.loading,
    failures: agentReadFailures(
      scoped.map((agent, i) => ({ agent, error: activities.errors[i] })),
    ),
    retry: () => {
      for (const i of failedIndexes) {
        // `refetchQueries` resolves with the outcome rather than rejecting, and
        // a second failure repaints the strip that offered this button, so
        // there is no unhandled rejection and nothing is swallowed here.
        void queryClient.refetchQueries({
          queryKey: queryKeys.activity(scoped[i].folderPath),
        });
      }
    },
    retrying: failedIndexes.some((i) => activities.fetching[i]),
  };
}
