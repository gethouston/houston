import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { Activity } from "../../data/activity";
import { useAllConversations } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useReadCursorStore } from "../../hooks/use-read-cursors";
import { useSession } from "../../hooks/use-session";
import { isMultiplayer } from "../../lib/org-roles";
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

  // Unread badges (HOU-945). Multiplayer-gated twice over, exactly like
  // `useBoardUnread`: off multiplayer the `unread` option is never passed, so
  // every count stays 0 and single-player / desktop renders today's chrome with
  // no dot to explain; and the model itself counts nothing without a `selfId` —
  // an unread mark nobody is signed in to clear is a mark that never clears.
  // The cursor store is an EXTERNAL store, not a query, so reading it here adds
  // no observer and keeps the perf discipline above intact.
  const { capabilities } = useCapabilities();
  const multiplayer = isMultiplayer(capabilities);
  const cursors = useReadCursorStore();
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;

  return useMemo(() => {
    // The version stamp is not read below — it is a dependency so the memo
    // recomputes when a board query lands/updates in the cache.
    void cacheVersion;
    const summaries = buildAgentActivitySummaries(
      agents,
      conversations ?? [],
      multiplayer ? { store: cursors, selfId } : undefined,
    );
    if (!aggregateIsAuthoritative) {
      // While the aggregate has not fetched for the current roster key (cold
      // boot, pods still waking), an agent with restored/live board data gets
      // its badge from the SAME rows the board and the "Activity N" tab
      // render — cache reads only, never a fetch.
      for (const agent of agents) {
        const activities = queryClient.getQueryData<Activity[]>(
          queryKeys.activity(agent.folderPath),
        );
        if (!activities) continue;
        // Board rows carry no attribution, so they can only answer needs-you /
        // running. Keep the unread number the aggregate already computed rather
        // than zeroing a badge the user can see.
        summaries[agent.id] = {
          ...summarizeActivities(activities),
          unreadCount: summaries[agent.id]?.unreadCount ?? 0,
        };
      }
    }
    return summaries;
  }, [
    agents,
    conversations,
    aggregateIsAuthoritative,
    queryClient,
    cacheVersion,
    multiplayer,
    cursors,
    selfId,
  ]);
}
