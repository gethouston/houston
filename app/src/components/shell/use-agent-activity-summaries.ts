import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { Activity } from "../../data/activity";
import { useAllConversations } from "../../hooks/queries";
import { sliceCoverage } from "../../lib/all-conversations-coverage";
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
  const aggregateIsAuthoritative =
    conversations !== undefined && !aggregate.isPlaceholderData;

  const queryClient = useQueryClient();
  const activityCacheVersion = useRef(0);
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryKey[0] !== "activity") return;
        if (event.type !== "updated" && event.type !== "removed") return;
        activityCacheVersion.current += 1;
        onStoreChange();
      }),
    [queryClient],
  );
  const cacheVersion = useSyncExternalStore(subscribe, () => {
    return activityCacheVersion.current;
  });
  const coverageVersion = useRef(0);
  const subscribeCoverage = useCallback(
    (onStoreChange: () => void) =>
      sliceCoverage.subscribe(() => {
        coverageVersion.current += 1;
        onStoreChange();
      }),
    [],
  );
  const coverageStamp = useSyncExternalStore(
    subscribeCoverage,
    () => coverageVersion.current,
  );

  return useMemo(() => {
    void cacheVersion;
    void coverageStamp;
    const summaries = buildAgentActivitySummaries(
      agents,
      conversations ?? [],
      aggregateIsAuthoritative ? sliceCoverage.wasRead : () => false,
    );
    if (!aggregateIsAuthoritative) {
      for (const agent of agents) {
        const activities = queryClient.getQueryData<Activity[]>(
          queryKeys.activity(agent.folderPath),
        );
        if (!activities) continue;
        summaries[agent.id] = summarizeActivities(activities, false);
      }
    }
    return summaries;
  }, [
    agents,
    conversations,
    aggregateIsAuthoritative,
    queryClient,
    cacheVersion,
    coverageStamp,
  ]);
}
