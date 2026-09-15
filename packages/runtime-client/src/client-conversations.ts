/**
 * The conversation-record half of {@link HoustonEngineClient}: listing chats,
 * reading a transcript window, and the lifecycle writes over one chat (cancel,
 * mode, dismiss, truncate, rename, delete, title).
 *
 * Split out of `./client.ts` for size, not for reach — these are methods OF the
 * conversation client, so they stay on it, and the base declares only the
 * transport it needs ({@link json}). What does NOT live here is the live half:
 * `sendMessage` and `streamEvents` stay beside the requester in `./client.ts`,
 * because they are the only two calls that use the raw {@link Requester}
 * (a 202 with no body, an SSE body read frame by frame) rather than JSON.
 *
 * CHAIN — this extends {@link EngineCredentialClient} only so that
 * {@link HoustonEngineClient} has ONE parent. The two bases are size splits of
 * a single class, not a hierarchy: neither knows anything about the other, and
 * the order they are chained in carries no meaning. `client-auth.ts` is the
 * root (it extends nothing), and `client.ts` supplies the transport both
 * declare.
 */

import { EngineCredentialClient } from "./client-auth";
import type { ConversationHistory, ConversationSummary } from "./types";

/** The per-conversation record routes, mixed into the engine client. */
export abstract class EngineConversationsClient extends EngineCredentialClient {
  listConversations() {
    return this.json<ConversationSummary[]>("/conversations");
  }
  /**
   * Read a conversation's transcript. `limit` fetches only the LAST N messages
   * (the chat-open window, HOU-819); `before` fetches the window ENDING at
   * that absolute index (the response's `offset`) — the load-older page. No
   * options = the full transcript. A pre-windowing server ignores the params
   * and returns everything — callers must treat `offset`/`totalMessages` as
   * optional.
   */
  getHistory(id: string, opts: { limit?: number; before?: number } = {}) {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.before !== undefined) params.set("before", String(opts.before));
    const qs = params.toString();
    return this.json<ConversationHistory>(
      `/conversations/${encodeURIComponent(id)}/messages${qs ? `?${qs}` : ""}`,
    );
  }
  /**
   * Abort a conversation's in-flight turn. `cancelled` reports whether a live
   * turn was actually stopped: `false` means there was nothing in flight (the
   * turn is orphaned — e.g. the runtime restarted), so no terminal event will
   * follow and the caller must settle any stuck "running" UI itself.
   */
  cancel(id: string) {
    return this.json<{ ok: boolean; cancelled: boolean }>(
      `/conversations/${encodeURIComponent(id)}/cancel`,
      { method: "POST" },
    );
  }
  /**
   * Apply a Mode-pill switch to the conversation's EXECUTING turn (Claude
   * Code's shift+tab semantics): the running turn's tools adopt the new mode at
   * their next decision point. `applied: false` is benign — no turn was
   * running, and the next send pins the mode itself.
   */
  setMode(id: string, mode: "execute" | "plan" | "auto") {
    return this.json<{ ok: boolean; applied: boolean }>(
      `/conversations/${encodeURIComponent(id)}/mode`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      },
    );
  }
  /**
   * Append the durable stop marker to retire a pending interaction (the stepper
   * X / abandon). Answers 409 if a turn is running — the card is never shown
   * mid-turn, so a race means the user should Stop instead.
   */
  dismissInteraction(id: string) {
    return this.json<{ ok: boolean }>(
      `/conversations/${encodeURIComponent(id)}/dismiss-interaction`,
      { method: "POST" },
    );
  }
  /**
   * Edit-and-resend rewind (PRODUCT-1217): drop the transcript tail from the
   * named user turn onward. The caller follows up with a normal send carrying
   * the edited text. Answers 409 while a turn is queued or running, 404 when
   * the turn id is unknown (e.g. a pre-turn-id transcript row).
   */
  truncateConversation(id: string, turnId: string) {
    return this.json<{ ok: boolean; removed: number }>(
      `/conversations/${encodeURIComponent(id)}/truncate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId }),
      },
    );
  }
  renameConversation(id: string, title: string) {
    return this.json<{ ok: boolean }>(
      `/conversations/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
  }
  /** Delete the conversation: transcript, live session, and pi session history. */
  deleteConversation(id: string) {
    return this.json<{ ok: boolean }>(
      `/conversations/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
  }
  /** Generate + persist a short LLM title; returns it. */
  summarizeTitle(id: string) {
    return this.json<{ title: string }>(
      `/conversations/${encodeURIComponent(id)}/title`,
      { method: "POST" },
    );
  }
  /**
   * Title an arbitrary excerpt (the composer's first message), with no stored
   * conversation. Returns "" when the model emits nothing — the caller falls
   * back to truncation.
   */
  summarizeText(text: string) {
    return this.json<{ title: string }>("/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }
}
