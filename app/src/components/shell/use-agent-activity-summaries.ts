import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { Activity } from "../../data/activity";
import { useAllConversations } from "../../hooks/queries";
import { queryKeys } from "../../lib/query-keys";
import type { Agent } from "../../lib/types";
import {
  buildAgentActivitySummaries,
  summarizeActivities,
} from "./agent-activity-summary-model";

export function useAgentActivitySummaries(
  agents: Pick<Agent, "id" | "folderPath">[],
) {
  const agentPaths = useMemo(
    () => agents.map((agent) => agent.folderPath),
    [agents],
  );
  const aggregate = useAllConversations(agentPaths);
  const conversations = aggregate.data;
  // Placeholder = a disk-restored older roster variant (or the previous key's
  // data), not a fetch for THIS roster — good enough to paint, but each
  // agent's own restored board query is at least as fresh, so it wins below.
  const aggregateIsAuthoritative =
    conversations !== undefined && !aggregate.isPlaceholderData;

  // Re-render when any agent's own board query (`["activity", path]`) changes
  // in the cache, WITHOUT attaching query observers: a per-render useQueries
  // subscription here re-synced its observers on every sidebar render and the
  // resulting notification churn kept the whole shell re-rendering (the
  // auto-opened chat panel could no longer be Escape-closed — caught by the
  // web e2e suite). A raw QueryCache subscription has no options to re-sync,
  // and it can never trigger a fetch, so it also can't wake a pod.
  const queryClient = useQueryClient();
  const activityCacheVersion = useRef(0);
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryKey[0] !== "activity") return;
        activityCacheVersion.current += 1;
        onStoreChange();
      }),
    [queryClient],
  );
  const cacheVersion = useSyncExternalStore(subscribe, () => {
    return activityCacheVersion.current;
  });

  return useMemo(() => {
    // The version stamp is not read below — it is a dependency so the memo
    // recomputes when a board query lands/updates in the cache.
    void cacheVersion;
    const summaries = buildAgentActivitySummaries(agents, conversations ?? []);
    if (!aggregateIsAuthoritative) {
      // While the aggregate has not fetched for the current roster key (cold
      // boot, pods still waking), an agent with restored/live board data gets
      // its badge from the SAME rows the board and the "Activity N" tab
      // render — cache reads only, never a fetch.
      for (const agent of agents) {
        const activities = queryClient.getQueryData<Activity[]>(
          queryKeys.activity(agent.folderPath),
        );
        if (activities) summaries[agent.id] = summarizeActivities(activities);
      }
    }
    return summaries;
  }, [
    agents,
    conversations,
    aggregateIsAuthoritative,
    queryClient,
    cacheVersion,
  ]);
}
