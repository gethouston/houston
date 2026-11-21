import { conversationScope, type FeedOutput } from "@houston/sdk";
import {
  type CachedFrame,
  writeCachedConversation,
} from "./conversation-cache";
import { conversationStore } from "./vm";

export function cachePersistOutput(): FeedOutput {
  return {
    pushFeedItem() {},
    sessionStatus() {},
    async persistBoardStatus(agentPath, sessionKey, status, _pi, opts) {
      if (status === "running" || opts?.provisional) return;
      const snapshot = conversationStore.getSnapshot(
        conversationScope(agentPath, sessionKey),
      ) as { feed?: CachedFrame[] } | undefined;
      const frames = snapshot?.feed;
      if (!frames || frames.length === 0) return;
      void writeCachedConversation(
        agentPath,
        sessionKey,
        frames.map((f) => ({
          feed_type: f.feed_type,
          data: f.data,
          ...(f.ts !== undefined ? { ts: f.ts } : {}),
          ...(f.author !== undefined ? { author: f.author } : {}),
          ...(f.mentions !== undefined ? { mentions: f.mentions } : {}),
          ...(f.turnId !== undefined ? { turnId: f.turnId } : {}),
          ...(f.toolIndex !== undefined ? { toolIndex: f.toolIndex } : {}),
          ...(f.notice !== undefined ? { notice: f.notice } : {}),
        })),
      );
    },
  };
}
