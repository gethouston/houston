import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { agentRosterSettled } from "../../lib/agent-gone";
import { latestCachedAllConversations } from "../../lib/all-conversations-cache";
import { mergePartialSweep } from "../../lib/all-conversations-recovery";
import { queryKeys } from "../../lib/query-keys";
import { type RawConversation, tauriChat } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import {
  recoverFromSweep,
  retargetSweepRecovery,
  sweepWithRetry,
} from "./all-conversations-sweep";

/**
 * How long a cross-agent sweep stays authoritative. Long enough that moving
 * between screens never re-fans-out to every agent's pod, short enough that a
 * restored-from-disk board (always older than this) is revalidated on the boot
 * that restores it — the HOU-981 "my missions are gone after login" fix.
 */
export const ALL_CONVERSATIONS_STALE_MS = 10 * 60_000;

export function useAllConversations(agentPaths: string[]) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.allConversations(agentPaths);
  const roster = queryKey.join("\0");
  // Gated on the roster having settled for the CURRENT space, like the
  // skills-manifest fan-out (HOUSTON-APP-544): a space switch wipes the query
  // cache and refires every mounted query, but `agentPaths` still names the
  // PREVIOUS space's agents until `loadAgents` re-resolves — a fan-out in that
  // window asks the new org about agents it never had, and every read
  // answers `404 agent not found` (HOUSTON-APP-4WR). Data already held is
  // kept while the gate is closed; the fresh roster gets its own key.
  const rosterSettled = useAgentStore(agentRosterSettled);
  // A space switch (or any roster change) retires the previous roster's
  // recovery run and its pending re-sweep the moment it happens — waiting for
  // the next sweep to settle would leave a dead roster's timer free to
  // prefix-invalidate the fleet the user just switched to. Every consumer
  // mounts this hook with the same roster, so this converges to one value.
  useEffect(() => {
    retargetSweepRecovery(roster);
  }, [roster]);
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { items, failedAgents } = await sweepWithRetry(agentPaths);
      // A partial sweep must never present itself as the whole board: the
      // agents that did not answer keep their last-known missions (HOU-981).
      const merged = mergePartialSweep(
        items,
        previousRows(queryClient, queryKey),
        failedAgents.map((f) => f.agentPath),
      );
      recoverFromSweep(failedAgents, roster, queryClient);
      return merged;
    },
    enabled: agentPaths.length > 0 && rosterSettled,
    // keepPreviousData, PLUS the newest disk-restored roster variant: the key
    // embeds every agent's folderPath, so the IndexedDB-restored entry only
    // re-attaches on an exact roster match — any drift would blank the sidebar
    // badges / Mission Control until the live fan-out returns (held for every
    // asleep pod's wake). See lib/all-conversations-cache.ts.
    placeholderData: (previousData) =>
      previousData ??
      latestCachedAllConversations<RawConversation[]>(queryClient),
    // Never refetched on focus, and never on a timer: in hosted mode this
    // queryFn fans out one request to EVERY agent's pod, and each of those
    // requests resets the pod's idle-sleep clock — a BACKGROUND full sweep
    // would keep the whole fleet awake for as long as the app is open. Between
    // sweeps the rows are kept current by single-agent cache patches from the
    // push events stream (use-agent-invalidation.ts patchAllConversations).
    //
    // The freshness window is finite, though, and that is the HOU-981 fix. It
    // used to be `Infinity`, which combined lethally with disk persistence: the
    // aggregate is restored from IndexedDB carrying its ORIGINAL
    // `dataUpdatedAt`, and an infinitely-fresh restored copy is never
    // revalidated by anything — not a mount, not focus, not the event plan. A
    // user who signed in the next morning saw yesterday's board for the whole
    // session, so every mission created while the app was closed (an overnight
    // routine, a teammate, another device) was simply invisible.
    //
    // Why a window and not `refetchOnMount: "always"`: seven surfaces mount
    // this hook (sidebar badges, Mission Control, archived, mentions inbox,
    // command palette, …), and "always" fans out to the whole fleet on each of
    // their mounts — the very pod-wake storm the Infinity was there to prevent.
    // A window revalidates the boot (a restored copy is always older than it)
    // while a mid-session navigation reuses the cache.
    staleTime: ALL_CONVERSATIONS_STALE_MS,
    refetchOnWindowFocus: false,
    // No `retry` here on purpose (the global default is `retry: false`): a cold
    // pod does outlive `cpFetch`'s ~2s of blind retries, but retrying at THIS
    // layer re-enters `call()` on every attempt and each rejection toasts and
    // captures. The bounded, transient-only retry lives in `sweepWithRetry`,
    // where the intermediate attempts stay silent.
  });
}

/** The rows this key last held, else the newest cached roster variant — what a
 *  partial sweep carries forward for the agents that did not answer. */
function previousRows(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
): RawConversation[] | undefined {
  return (
    queryClient.getQueryData<RawConversation[]>(queryKey) ??
    latestCachedAllConversations<RawConversation[]>(queryClient)
  );
}

/**
 * Live resync for an OPEN conversation (HOU-731). The transcript renders from
 * the SDK conversation VM, not from this query's data — but `loadHistory`
 * seeds that VM (and refreshes the local transcript cache) as a side effect,
 * so subscribing the open chat to `queryKeys.chatHistory` is what makes the
 * `ConversationsChanged` → `chatHistoryForAgent` invalidation in
 * use-agent-invalidation.ts actually repaint it: a turn written by a teammate,
 * another device, or a routine reaches the open chat without a reselect.
 * Never refetched on focus/staleness — in hosted mode a background read wakes
 * the agent's pod; only a real change event (or mount) triggers the read.
 */
export function useChatHistory(
  agentPath: string | undefined,
  sessionKey: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.chatHistory(agentPath ?? "", sessionKey ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath is required");
      if (!sessionKey) throw new Error("sessionKey is required");
      return tauriChat.loadHistory(agentPath, sessionKey);
    },
    enabled: !!agentPath && !!sessionKey,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
}
