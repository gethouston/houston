import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { latestCachedAllConversations } from "../../lib/all-conversations-cache";
import {
  mergePartialSweep,
  planPartialSweep,
} from "../../lib/all-conversations-recovery";
import { showErrorToast } from "../../lib/error-toast";
import i18n from "../../lib/i18n";
import { queryKeys } from "../../lib/query-keys";
import {
  type RawConversation,
  tauriChat,
  tauriConversations,
} from "../../lib/tauri";
import { isTransientEngineError } from "../../lib/transient-error";

export function useConversations(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriConversations.list(agentPath);
    },
    enabled: !!agentPath,
  });
}

/** Attempts a transient sweep failure gets before the board surfaces it. */
const SWEEP_RETRIES = 3;

/**
 * How long a cross-agent sweep stays authoritative. Long enough that moving
 * between screens never re-fans-out to every agent's pod, short enough that a
 * restored-from-disk board (always older than this) is revalidated on the boot
 * that restores it — the HOU-981 "my missions are gone after login" fix.
 */
export const ALL_CONVERSATIONS_STALE_MS = 10 * 60_000;

// Recovery bookkeeping for the ONE cross-agent aggregate. Module scope, not
// refs: seven surfaces mount this hook and any of their queryFn closures may be
// the one TanStack runs for a given fetch, so per-component counters would
// split the run and re-toast. One query, one counter, one pending re-sweep.
let partialSweepRun = 0;
let partialSweepTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * React to a settled sweep: a COMPLETE one clears the run; an incomplete one
 * surfaces itself and schedules its own re-sweep. The decision (what to toast,
 * when to retry) is the pure `planPartialSweep`; this only executes it.
 */
function recoverFromSweep(
  failedAgentPaths: string[],
  queryClient: QueryClient,
): void {
  if (failedAgentPaths.length === 0) {
    partialSweepRun = 0;
    return;
  }
  const decision = planPartialSweep(failedAgentPaths.length, partialSweepRun);
  partialSweepRun += 1;
  if (decision.toast) {
    // The beta no-silent-failures path: the branded toast + auto-report, with
    // authored copy instead of the raw diagnostic (which the adapter already
    // logged per agent, and which rides the Sentry report).
    showErrorToast(
      "list_all_conversations_partial",
      `missions unread for ${failedAgentPaths.length} agent(s): ${failedAgentPaths.join(", ")}`,
      undefined,
      { userMessage: i18n.t("dashboard:errors.partialMissionLoad") },
    );
  }
  // Nothing else would revisit this hole inside the freshness window, so an
  // incomplete sweep schedules its own bounded re-sweep.
  if (partialSweepTimer) clearTimeout(partialSweepTimer);
  partialSweepTimer = undefined;
  if (decision.retryInMs === undefined) return;
  partialSweepTimer = setTimeout(() => {
    partialSweepTimer = undefined;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.allConversations([]),
    });
  }, decision.retryInMs);
}

export function useAllConversations(agentPaths: string[]) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.allConversations(agentPaths);
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { items, failedAgentPaths } =
        await tauriConversations.listAll(agentPaths);
      // A partial sweep must never present itself as the whole board: the
      // agents that did not answer keep their last-known missions (HOU-981).
      const merged = mergePartialSweep(
        items,
        previousRows(queryClient, queryKey),
        failedAgentPaths,
      );
      recoverFromSweep(failedAgentPaths, queryClient);
      return merged;
    },
    enabled: agentPaths.length > 0,
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
    // The global default is `retry: false`. A cold pod outlives `cpFetch`'s ~2s
    // of blind retries, and giving up there is what renders the empty board.
    // Bounded and transient-only: a 4xx still fails fast.
    retry: (failureCount, error) =>
      failureCount < SWEEP_RETRIES && isTransientEngineError(error),
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
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
