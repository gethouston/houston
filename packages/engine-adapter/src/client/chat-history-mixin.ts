import { historyToFeed as sdkHistoryToFeed } from "@houston/sdk";
import type { ChatHistoryEntry } from "@houston/wire-types";
import {
  type CachedFrame,
  writeCachedConversation,
} from "../conversation-cache";
import {
  historyReadMark,
  readPastOwnTurnsOn,
  seedConversationVm,
} from "../conversation-seed";
import { CHAT_OPEN_WINDOW, SEARCH_SCAN_WINDOW } from "../history-window";
import { historyToFeed, isConversationNotFound } from "../translate";
import { observeConversation } from "../turn-stream";
import { setActivityStatus } from "./activity-status";
import { cachedFallbackTranscript, seedFromCache } from "./history-cache";
import { loadOlderPage } from "./load-older";
import type { BaseCtor } from "./mixin";

const openLoadsInFlight = new Map<string, Promise<ChatHistoryEntry[]>>();

export function ChatHistoryMixin<TBase extends BaseCtor>(Base: TBase) {
  class ChatHistory extends Base {
    loadChatHistory(
      agentPath: string,
      sessionKey: string,
      opts: { observe?: boolean } = {},
    ): Promise<ChatHistoryEntry[]> {
      if (opts.observe === false) {
        return this.loadChatHistoryNow(agentPath, sessionKey, opts);
      }
      const key = `${agentPath}|${sessionKey}`;
      const inFlight = openLoadsInFlight.get(key);
      if (inFlight) return inFlight;
      const load = this.loadChatHistoryNow(agentPath, sessionKey, opts).finally(
        () => openLoadsInFlight.delete(key),
      );
      openLoadsInFlight.set(key, load);
      return load;
    }

    private async loadChatHistoryNow(
      agentPath: string,
      sessionKey: string,
      opts: { observe?: boolean } = {},
    ): Promise<ChatHistoryEntry[]> {
      const observing = opts.observe !== false;
      let cachedFrames: CachedFrame[] | null = null;
      if (this.ctx.cp && observing) {
        cachedFrames = await seedFromCache(agentPath, sessionKey);
      }
      try {
        const engine = this.ctx.cp
          ? this.ctx.sdk.clientFor(agentPath)
          : this.ctx.engine;
        const read = () =>
          engine.getHistory(sessionKey, {
            limit: observing ? CHAT_OPEN_WINDOW : SEARCH_SCAN_WINDOW,
          });
        const { value: history, mark } = observing
          ? await readPastOwnTurnsOn(agentPath, sessionKey, read)
          : { value: await read(), mark: 0 };
        const current =
          mark !== null && historyReadMark(agentPath, sessionKey) === mark;
        const sdkFeed = sdkHistoryToFeed(history.messages);
        const window = {
          earliestLoaded: history.offset ?? 0,
          total: history.totalMessages ?? history.messages.length,
        };
        if (this.ctx.cp && observing && current) {
          void writeCachedConversation(agentPath, sessionKey, sdkFeed);
        }
        if (observing && current) {
          seedConversationVm(agentPath, sessionKey, sdkFeed, mark, window);
          observeConversation(
            engine,
            agentPath,
            sessionKey,
            (status, pendingInteraction) =>
              setActivityStatus(
                this.ctx,
                agentPath,
                sessionKey,
                status,
                pendingInteraction,
              ),
            window.total,
          );
        }
        return historyToFeed(history.messages);
      } catch (err) {
        if (isConversationNotFound(err)) {
          const fallback = this.ctx.cp
            ? await cachedFallbackTranscript(
                agentPath,
                sessionKey,
                cachedFrames,
              )
            : null;
          if (fallback && fallback.length > 0) {
            return fallback as ChatHistoryEntry[];
          }
          return [];
        }
        throw err;
      }
    }

    loadOlderChatHistory(
      agentPath: string,
      sessionKey: string,
    ): Promise<{ hasOlder: boolean }> {
      const engine = this.ctx.cp
        ? this.ctx.sdk.clientFor(agentPath)
        : this.ctx.engine;
      return loadOlderPage(engine, agentPath, sessionKey);
    }
  }
  return ChatHistory;
}
