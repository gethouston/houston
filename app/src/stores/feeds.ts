import { create } from "zustand";
import { mergeFeedItem } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";

/**
 * Feed store — nested by agent path, then by session key.
 *
 * This layout makes cross-agent bleeding structurally impossible: no code
 * path can accidentally read or write another agent's feed items because
 * you always need both keys to address a bucket. When an agent is deleted,
 * `clearAgent(agentPath)` drops all its sessions in one call.
 */
interface FeedState {
  items: Record<string, Record<string, FeedItem[]>>;
  pushFeedItem: (
    agentPath: string,
    sessionKey: string,
    item: FeedItem,
    opts?: { fromWs?: boolean },
  ) => void;
  setFeed: (agentPath: string, sessionKey: string, items: FeedItem[]) => void;
  clearFeed: (agentPath: string, sessionKey: string) => void;
  clearAgent: (agentPath: string) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  items: {},

  pushFeedItem: (agentPath, sessionKey, item, opts) => {
    return set((s) => {
      const agentBucket = s.items[agentPath] ?? {};
      const nextSession = mergeFeedItem(agentBucket[sessionKey] ?? [], item, opts);
      return {
        items: {
          ...s.items,
          [agentPath]: {
            ...agentBucket,
            [sessionKey]: nextSession,
          },
        },
      };
    });
  },

  setFeed: (agentPath, sessionKey, items) =>
    set((s) => ({
      items: {
        ...s.items,
        [agentPath]: {
          ...(s.items[agentPath] ?? {}),
          [sessionKey]: items,
        },
      },
    })),

  clearFeed: (agentPath, sessionKey) =>
    set((s) => {
      const agentBucket = s.items[agentPath];
      if (!agentBucket) return s;
      const { [sessionKey]: _, ...rest } = agentBucket;
      return {
        items: {
          ...s.items,
          [agentPath]: rest,
        },
      };
    }),

  clearAgent: (agentPath) =>
    set((s) => {
      const { [agentPath]: _, ...rest } = s.items;
      return { items: rest };
    }),
}));
