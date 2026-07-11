import { historyToFeed as sdkHistoryToFeed } from "@houston/sdk";
import type { ChatHistoryEntry } from "../../../../../ui/engine-client/src/types";
import * as controlPlane from "../control-plane";
import {
  type CachedFrame,
  readCachedConversation,
  writeCachedConversation,
} from "../conversation-cache";
import { historyToFeed, isConversationNotFound } from "../translate";
import { observeConversation, seedConversationVm } from "../turn-stream";
import { setActivityStatus } from "./activity-status";
import type { BaseCtor } from "./mixin";

export function ChatHistoryMixin<TBase extends BaseCtor>(Base: TBase) {
  class ChatHistory extends Base {
    async loadChatHistory(
      agentPath: string,
      sessionKey: string,
      opts: { observe?: boolean } = {},
    ): Promise<ChatHistoryEntry[]> {
      // Cache-first paint (HOU-712): a cloud read is HELD by the gateway for
      // the whole engine-pod cold start, so seed the VM from the last locally
      // persisted transcript NOW — the chat shows its messages instantly — and
      // let the network read below revalidate whenever it lands. The seed
      // guards in seedConversationVm keep a live or richer VM untouched, so a
      // stale cache can never clobber fresh state.
      let cachedFrames: CachedFrame[] | null = null;
      if (this.ctx.cp) {
        cachedFrames = await readCachedConversation(agentPath, sessionKey);
        if (cachedFrames && cachedFrames.length > 0 && opts.observe !== false) {
          seedConversationVm(agentPath, sessionKey, cachedFrames);
        }
      }
      try {
        const engine = this.ctx.cp
          ? controlPlane.runtimeClientFor(this.ctx.cp, agentPath)
          : this.ctx.engine;
        const history = await engine.getHistory(sessionKey);
        const sdkFeed = sdkHistoryToFeed(history.messages);
        // Refresh the local copy on EVERY successful read (bulk scans too), so
        // the next cold open paints the freshest transcript we ever saw.
        if (this.ctx.cp) {
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
        if (opts.observe !== false) {
          // Seed FIRST (the chat opens complete), then attach: the observer
          // renders any in-flight turn live into the same VM. Seeding is a no-op
          // when a live stream already owns this conversation (see
          // seedConversationVm) — its feed IS the VM. The VM seed is the SDK's
          // UNMAPPED fold: the VM carries engine provider ids uniformly (seeded
          // and live alike); the app's binding hook owns the old-id remap.
          seedConversationVm(agentPath, sessionKey, sdkFeed);
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
            history.messages.length,
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
          // A 404 with a locally cached transcript is NOT proof the chat never
          // existed: an engine pod can answer 404 while its data is lost or not
          // yet restored (volume recreation, seed self-heal window). The local
          // copy is the user's only surviving transcript then — serve it and
          // KEEP it (HOU-731). A truly deleted conversation drops out of the
          // conversation list, so nothing reopens its cached ghost; the size
          // cap prunes the orphaned entry eventually.
          if (cachedFrames && cachedFrames.length > 0) {
            return cachedFrames as ChatHistoryEntry[];
          }
          return [];
        }
        throw err;
      }
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
