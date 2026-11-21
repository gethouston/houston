import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { tauriChat } from "../lib/tauri";
import { useConversationVm } from "./use-conversation-vm";

const EMPTY_FEED: FeedItem[] = [];

export interface OpenConversationFeed {
  feedItems: Record<string, FeedItem[]>;
  hasOlderMessages: boolean;
  onLoadOlderMessages: () => Promise<void>;
}

export function useOpenConversationFeed(
  agentPath: string | null,
  sessionKey: string | null,
): OpenConversationFeed {
  const vm = useConversationVm(agentPath, sessionKey);
  const feed = vm?.feed ?? EMPTY_FEED;
  const feedItems = useMemo<Record<string, FeedItem[]>>(
    () => (sessionKey ? { [sessionKey]: feed } : {}),
    [sessionKey, feed],
  );
  const onLoadOlderMessages = useCallback(async () => {
    if (!agentPath || !sessionKey) return;
    await tauriChat.loadOlderHistory(agentPath, sessionKey);
  }, [agentPath, sessionKey]);

  return {
    feedItems,
    hasOlderMessages: (vm?.historyWindow?.earliestLoaded ?? 0) > 0,
    onLoadOlderMessages,
  };
}
