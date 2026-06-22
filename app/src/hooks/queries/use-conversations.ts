import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriConversations, tauriChat } from "../../lib/tauri";

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
  });
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
  });
}
