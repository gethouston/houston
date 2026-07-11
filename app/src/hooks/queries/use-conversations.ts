import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriChat, tauriConversations } from "../../lib/tauri";

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

export function useAllConversations(agentPaths: string[]) {
  return useQuery({
    queryKey: queryKeys.allConversations(agentPaths),
    queryFn: () => tauriConversations.listAll(agentPaths),
    enabled: agentPaths.length > 0,
    placeholderData: keepPreviousData,
    // Fetched ONCE per key (mount / roster change / engine restart), then kept
    // fresh by single-agent cache patches from the push events stream
    // (use-agent-invalidation.ts patchAllConversations). Never refetched on
    // focus or staleness: in hosted mode this queryFn fans out one request to
    // EVERY agent's pod, and each of those requests resets the pod's
    // idle-sleep clock — a background full sweep would keep the whole fleet
    // awake for as long as the app is open.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
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
