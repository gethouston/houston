import { historyToFeed as sdkHistoryToFeed } from "@houston/sdk";
import type { ChatHistoryEntry } from "../../../../../ui/engine-client/src/types";
import * as controlPlane from "../control-plane";
import {
  type CachedFrame,
  writeCachedConversation,
} from "../conversation-cache";
import { CHAT_OPEN_WINDOW, SEARCH_SCAN_WINDOW } from "../history-window";
import { historyToFeed, isConversationNotFound } from "../translate";
import { observeConversation, seedConversationVm } from "../turn-stream";
import { setActivityStatus } from "./activity-status";
import { cachedFallbackTranscript, seedFromCache } from "./history-cache";
import { loadOlderPage } from "./load-older";
import type { BaseCtor } from "./mixin";

/**
 * Single-flight for OBSERVED chat-open reads (HOU-819): opening a chat fires
 * this read twice — the board's hydrate call and the chat-history query's
 * fetch land in the same tick — and both want the identical windowed read +
 * VM seed. Sharing the in-flight promise halves the open traffic; bulk reads
 * (`observe: false`) never join it — they read a different window and take a
 * different path through the cache.
 */
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
      // Cache-first paint on an open; a bulk scan skips it (see seedFromCache).
      let cachedFrames: CachedFrame[] | null = null;
      if (this.ctx.cp && observing) {
        cachedFrames = await seedFromCache(agentPath, sessionKey);
      }
      try {
        const engine = this.ctx.cp
          ? controlPlane.runtimeClientFor(this.ctx.cp, agentPath)
          : this.ctx.engine;
        // Every read is windowed. A conversation OPEN reads the tail window
        // (HOU-819) — long missions used to fetch and fold their entire
        // transcript here, the main "chat hangs before opening" cost. A BULK
        // read (mission search scanning every mission for the phrase) reads the
        // wider scan window (HOU-941) — full transcripts, N missions at a time,
        // were the "search takes 15 seconds" cost. A pre-windowing server
        // ignores `limit` and returns everything — `offset`/`totalMessages`
        // then default to the full-transcript shape.
        const history = await engine.getHistory(sessionKey, {
          limit: observing ? CHAT_OPEN_WINDOW : SEARCH_SCAN_WINDOW,
        });
        const sdkFeed = sdkHistoryToFeed(history.messages);
        const window = {
          earliestLoaded: history.offset ?? 0,
          total: history.totalMessages ?? history.messages.length,
        };
        // Refresh the local copy on every successful OPEN, so the next cold
        // open paints the freshest transcript we ever saw. Bulk scans are
        // excluded (HOU-941): each write enumerates and prunes the whole store,
        // which a board-wide search paid once per mission, and it would evict
        // the conversations the user actually opens in favour of ones they only
        // ever searched through.
        if (this.ctx.cp && observing) {
          void writeCachedConversation(agentPath, sessionKey, sdkFeed);
        }
        // Observer mode: a loaded chat may have a turn in flight that THIS client
        // isn't streaming (page reloaded mid-turn, or another client sent it).
        // Attach a passive resumable stream: if the server's `sync` reports a
        // running turn it surfaces (spinner + partial) and renders to completion;
        // an idle conversation closes the stream right after that `sync`. No-op
        // when the conversation is already streamed here. `observe: false` is
        // for BULK history reads (mission search, board scans) that load N
        // conversations at a time and must not spawn N streams — only a real
        // conversation open observes (the default).
        if (observing) {
          // Seed FIRST (the chat opens complete), then attach: the observer
          // renders any in-flight turn live into the same VM. Seeding is a no-op
          // when a live stream already owns this conversation (see
          // seedConversationVm) — its feed IS the VM. The VM seed is the SDK's
          // UNMAPPED fold: the VM carries engine provider ids uniformly (seeded
          // and live alike); the app's binding hook owns the old-id remap.
          seedConversationVm(agentPath, sessionKey, sdkFeed, window);
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
            // The legacy settle guard compares against a FULL history reload,
            // so hand it the transcript's total, not the window's length.
            window.total,
          );
        }
        return historyToFeed(history.messages);
      } catch (err) {
        // A conversation with no persisted turns yet 404s — that IS an empty
        // conversation (a fresh card opened before its first turn lands), not
        // a failure. Anything else (network drop, auth, 5xx) propagates so the
        // app's `call()` wrapper toasts it with the Report-bug affordance —
        // returning [] would render a fake empty chat and swallow the error.
        if (isConversationNotFound(err)) {
          // The local copy may be the user's only surviving transcript — see
          // cachedFallbackTranscript.
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

    /**
     * Prepend the previous transcript page before the loaded window — the
     * scroll-up lazy-load (HOU-819). See {@link loadOlderPage}.
     */
    loadOlderChatHistory(
      agentPath: string,
      sessionKey: string,
    ): Promise<{ hasOlder: boolean }> {
      const engine = this.ctx.cp
        ? controlPlane.runtimeClientFor(this.ctx.cp, agentPath)
        : this.ctx.engine;
      return loadOlderPage(engine, agentPath, sessionKey);
    }

    /**
     * Ask the engine to summarize the user's first message into a short mission
     * title. Cloud: the per-agent runtime client (the same path other conversation
     * calls take) runs an LLM title turn in the agent's sandbox. Local: the single
     * runtime. A clean truncation fallback covers an empty model reply, a missing
     * agent, or any transport failure — the title is cosmetic, never block the send.
     */
    async summarizeActivity(
      message: string,
      opts: { agentPath?: string } = {},
    ) {
      const truncated =
        message.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
      try {
        const agentId =
          opts.agentPath || this.ctx.currentAgentId() || undefined;
        const engine = this.ctx.cp
          ? agentId
            ? controlPlane.runtimeClientFor(this.ctx.cp, agentId)
            : null
          : this.ctx.engine;
        if (engine) {
          const { title } = await engine.summarizeText(message);
          const clean = title.trim();
          if (clean) return { title: clean, description: "" };
        }
      } catch {
        /* engine unreachable / not authed / no agent → fall back to truncation */
      }
      return { title: truncated, description: "" };
    }
  }
  return ChatHistory;
}
