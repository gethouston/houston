import { conversationScope, type FeedOutput } from "@houston/sdk";
import { writeCachedConversation } from "./conversation-cache";
import { conversationStore } from "./vm";

/**
 * Persist the VM's folded feed to the local conversation cache when a turn
 * (or observed turn) settles, so the transcript a cold reopen paints includes
 * everything sent THIS session — not just the state at the last history read
 * (HOU-712). Frames were already folded by the VM (first in the multiplex);
 * this just snapshots them. Cloud-only by construction: the cache no-ops
 * without a gateway identity. Fire-and-forget — a cache write must never
 * delay a settle.
 */
export function cachePersistOutput(): FeedOutput {
  return {
    pushFeedItem() {},
    sessionStatus() {},
    async persistBoardStatus(agentPath, sessionKey, status) {
      if (status === "running") return;
      const snapshot = conversationStore.getSnapshot(
        conversationScope(agentPath, sessionKey),
      ) as
        | { feed?: { feed_type: string; data: unknown; ts?: number }[] }
        | undefined;
      const frames = snapshot?.feed;
      if (!frames || frames.length === 0) return;
      void writeCachedConversation(
        agentPath,
        sessionKey,
        frames.map((f) => ({
          feed_type: f.feed_type,
          data: f.data,
          ...(f.ts !== undefined ? { ts: f.ts } : {}),
        })),
      );
    },
  };
}
