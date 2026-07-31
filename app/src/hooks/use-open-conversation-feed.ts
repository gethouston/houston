import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { tauriChat } from "../lib/tauri";
import { useConversationVm } from "./use-conversation-vm";

const EMPTY_FEED: FeedItem[] = [];

export interface OpenConversationFeed {
  /** Single-entry map: AIBoard only ever reads `feedItems[openSessionKey]`. */
  feedItems: Record<string, FeedItem[]>;
  /** Whether older pages remain above the loaded window (HOU-819). */
  hasOlderMessages: boolean;
  /** Prepend the previous page when the user scrolls to the top. */
  onLoadOlderMessages: () => Promise<void>;
}

/**
 * The ONE open conversation's reactive feed, for the list surfaces that show a
 * chat beside a column-less list (both Archived views). History is seeded by
 * the adapter's loadHistory and folded by the SDK conversation VM; the tail
 * window plus scroll-up lazy-load come with it, so a long archived transcript
 * opens instantly and grows upward.
 */
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
