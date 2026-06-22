import { create } from "zustand";
import { mergeFeedItem, reconcileUserMessageEcho } from "@houston-ai/chat";
import type {
  FeedItem,
  MergeFeedOptions,
  PendingUserEcho,
} from "@houston-ai/chat";

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
  /**
   * Optimistic `user_message` pushes still awaiting their WS echo, nested by
   * agent path then session key. Lets `pushFeedItem` drop the engine's echo of
   * a prompt this client already showed without collapsing distinct turns that
   * happen to share text — e.g. every run of a routine, which now share one
   * chat (#381). See `reconcileUserMessageEcho`.
   */
  pendingEcho: Record<string, Record<string, PendingUserEcho>>;
  /**
   * Merge one item into a session's feed. Pass `{ fromWs: true }` for items
   * delivered over the engine WebSocket so a re-broadcast `user_message` echo
   * is deduped against the matching optimistic push. Optimistic local pushes
   * omit it so a deliberate repeat (and every routine run's prompt) still
   * appends.
   */
  pushFeedItem: (
    agentPath: string,
    sessionKey: string,
    item: FeedItem,
    opts?: MergeFeedOptions,
  ) => void;
  setFeed: (agentPath: string, sessionKey: string, items: FeedItem[]) => void;
  clearFeed: (agentPath: string, sessionKey: string) => void;
  clearAgent: (agentPath: string) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  items: {},
  pendingEcho: {},

  pushFeedItem: (agentPath, sessionKey, item, opts) => {
    return set((s) => {
      const agentPending = s.pendingEcho[agentPath] ?? {};
      const sessionPending = { ...(agentPending[sessionKey] ?? {}) };
      const keep = reconcileUserMessageEcho(
        sessionPending,
        item,
        opts?.fromWs ?? false,
      );
      const pendingEcho = {
        ...s.pendingEcho,
        [agentPath]: { ...agentPending, [sessionKey]: sessionPending },
      };
      // Drop the WS echo of a prompt already shown optimistically, but keep the
      // decremented pending tally so a later identical send still matches.
      if (!keep) return { pendingEcho };

      const agentBucket = s.items[agentPath] ?? {};
      const nextSession = mergeFeedItem(agentBucket[sessionKey] ?? [], item);
      return {
        pendingEcho,
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
      const agentPending = s.pendingEcho[agentPath];
      const { [sessionKey]: __, ...restPending } = agentPending ?? {};
      return {
        items: {
          ...s.items,
          [agentPath]: rest,
        },
        pendingEcho: {
          ...s.pendingEcho,
          [agentPath]: restPending,
        },
      };
    }),

  clearAgent: (agentPath) =>
    set((s) => {
      const { [agentPath]: _, ...rest } = s.items;
      const { [agentPath]: __, ...restPending } = s.pendingEcho;
      return { items: rest, pendingEcho: restPending };
    }),
}));
