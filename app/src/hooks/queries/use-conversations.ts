import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { agentRosterSettled } from "../../lib/agent-gone";
import { latestCachedAllConversations } from "../../lib/all-conversations-cache";
import { sliceCoverage } from "../../lib/all-conversations-coverage";
import {
  foldSweep,
  sliceFreshness,
} from "../../lib/all-conversations-freshness";
import type { RawConversation } from "../../lib/conversations-facade";
import { queryKeys } from "../../lib/query-keys";
import { tauriChat } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import {
  recoverFromSweep,
  retargetSweepRecovery,
  sweepWithRetry,
} from "./all-conversations-sweep";

export const ALL_CONVERSATIONS_STALE_MS = 10 * 60_000;

export function useAllConversations(agentPaths: string[]) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.allConversations(agentPaths);
  const roster = queryKey.join("\0");
  const rosterSettled = useAgentStore(agentRosterSettled);
  useEffect(() => {
    retargetSweepRecovery(roster);
  }, [roster]);
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const startedAt = Date.now();
      const { items, failedAgents } = await sweepWithRetry(agentPaths, signal);
      const failedPaths = failedAgents.map((f) => f.agentPath);
      const failed = new Set(failedPaths);
      sliceCoverage.noteRead(agentPaths.filter((p) => !failed.has(p)));
      const overtaken = sliceFreshness.patchedSince(
        agentPaths.filter((p) => !failed.has(p)),
        startedAt,
      );
      const merged = foldSweep(
        items,
        previousRows(queryClient, queryKey),
        failedPaths,
        overtaken,
      );
      recoverFromSweep(failedAgents, roster, queryClient);
      return merged;
    },
    enabled: agentPaths.length > 0 && rosterSettled,
    placeholderData: (previousData) =>
      previousData ??
      latestCachedAllConversations<RawConversation[]>(queryClient),
    staleTime: ALL_CONVERSATIONS_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

function previousRows(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
): RawConversation[] | undefined {
  return (
    queryClient.getQueryData<RawConversation[]>(queryKey) ??
    latestCachedAllConversations<RawConversation[]>(queryClient)
  );
}

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
