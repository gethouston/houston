import { skipToken, useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
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

  // Cache-only subscription to every agent's own board query (skipToken —
  // fetching stays owned by the per-agent board, so this never wakes a pod).
  // While the aggregate has not fetched for the current roster key (cold
  // boot, pods still waking), an agent with restored/live board data gets its
  // badge from the SAME rows the board and the "Activity N" tab render.
  const cachedActivities = useQueries({
    queries: agents.map((agent) => ({
      queryKey: queryKeys.activity(agent.folderPath),
      queryFn: skipToken,
    })),
    combine: (results) => results.map((r) => r.data as Activity[] | undefined),
  });

  return useMemo(() => {
    const summaries = buildAgentActivitySummaries(agents, conversations ?? []);
    if (!aggregateIsAuthoritative) {
      agents.forEach((agent, index) => {
        const activities = cachedActivities[index];
        if (activities) summaries[agent.id] = summarizeActivities(activities);
      });
    }
    return summaries;
  }, [agents, conversations, aggregateIsAuthoritative, cachedActivities]);
}
