import type { HoustonEngineClient, ChatMessage, WireEvent } from "@houston/engine-client";
import type { ChatHistoryEntry } from "../../../../ui/engine-client/src/types";
import { emitEvent } from "./bus";
import { setStatusBySessionKey } from "./activities";

function feed(agentPath: string, sessionKey: string, item: unknown): void {
  emitEvent("FeedItem", { agent_path: agentPath, session_key: sessionKey, item });
}
function sessionStatus(agentPath: string, sessionKey: string, status: string, error?: string): void {
  emitEvent("SessionStatus", { agent_path: agentPath, session_key: sessionKey, status, error });
}

/**
 * Run one turn against the new engine and translate its events into the old
 * engine's `FeedItem` + `SessionStatus` events on the bus.
 *
 * The new engine decouples *observing* a conversation from *sending* to it:
 * subscribe to the conversation's id-scoped SSE stream (`streamEvents`), then
 * trigger the turn (`sendMessage`, fire-and-forget `202`). We subscribe FIRST so
 * the terminal `done` can never be missed, abort the stream once the turn ends,
 * and accumulate streaming text (the old engine emitted *accumulated* text and
 * `mergeFeedItem` replaces the live streaming item in place, so we do too).
 */
export async function streamTurn(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  prompt: string,
): Promise<void> {
  sessionStatus(agentPath, sessionKey, "running");
  setStatusBySessionKey(agentPath, sessionKey, "running");

  let text = "";
  let thinking = "";
  let settled = false;
  const ac = new AbortController();

  const finishOk = (): void => {
    if (settled) return;
    settled = true;
    if (thinking) feed(agentPath, sessionKey, { feed_type: "thinking", data: thinking });
    if (text) feed(agentPath, sessionKey, { feed_type: "assistant_text", data: text });
    feed(agentPath, sessionKey, {
      feed_type: "final_result",
      data: { result: text, cost_usd: null, duration_ms: null },
    });
    sessionStatus(agentPath, sessionKey, "completed");
    setStatusBySessionKey(agentPath, sessionKey, "needs_you");
  };
  const finishErr = (msg: string): void => {
    if (settled) return;
    settled = true;
    feed(agentPath, sessionKey, { feed_type: "system_message", data: msg });
    sessionStatus(agentPath, sessionKey, "error", msg);
    setStatusBySessionKey(agentPath, sessionKey, "error");
  };

  const onEvent = (ev: WireEvent): void => {
    switch (ev.type) {
      case "sync":
        // Reconnect catch-up: seed an in-flight assistant partial. A fresh turn's
        // first `sync` is empty (running:false); the terminal state always
        // arrives as `done`, so never treat `sync` itself as terminal.
        if (ev.data.running && ev.data.partial) {
          text = ev.data.partial;
          feed(agentPath, sessionKey, { feed_type: "assistant_text_streaming", data: text });
        }
        break;
      case "user":
        // app/src already renders the user's message optimistically on send;
        // skip the engine's echo so it isn't shown twice.
        break;
      case "text":
        text += ev.data;
        feed(agentPath, sessionKey, { feed_type: "assistant_text_streaming", data: text });
        break;
      case "thinking":
        thinking += ev.data;
        feed(agentPath, sessionKey, { feed_type: "thinking_streaming", data: thinking });
        break;
      case "tool_start":
        feed(agentPath, sessionKey, {
          feed_type: "tool_call",
          data: { name: ev.data.name, input: ev.data.args },
        });
        break;
      case "tool_end":
        feed(agentPath, sessionKey, {
          feed_type: "tool_result",
          data: { content: "", is_error: ev.data.isError },
        });
        break;
      case "error":
        finishErr(ev.data.message);
        ac.abort();
        break;
      case "done":
        finishOk();
        ac.abort();
        break;
    }
  };

  try {
    // Subscribe first (so the conversation's `done` can't be missed), then fire
    // the turn. The engine's per-conversation bus keeps an in-flight snapshot, so
    // even subscribing to a brand-new conversation is fine (it emits `sync` then
    // live-tails) and no event is lost to send/subscribe ordering.
    const streaming = engine.streamEvents(sessionKey, { signal: ac.signal, onEvent });
    await engine.sendMessage(sessionKey, prompt);
    await streaming;
    // The stream closed without our abort (engine closed it) — finalize from
    // what we have so the UI never hangs in "running".
    finishOk();
  } catch (e) {
    // Our own abort after a terminal event is the expected teardown, not a
    // failure; anything else (send rejected, stream dropped) is a real error.
    if (!(ac.signal.aborted && settled)) {
      finishErr(e instanceof Error ? e.message : String(e));
    }
  } finally {
    ac.abort();
  }
}

/** Convert new-engine history (ChatMessage[]) into old FeedItem[] for replay. */
export function historyToFeed(messages: ChatMessage[]): ChatHistoryEntry[] {
  const out: ChatHistoryEntry[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ feed_type: "user_message", data: m.content });
    } else {
      for (const t of m.tools ?? []) {
        out.push({ feed_type: "tool_call", data: { name: t.name, input: {} } });
        out.push({ feed_type: "tool_result", data: { content: "", is_error: !!t.isError } });
      }
      if (m.content) out.push({ feed_type: "assistant_text", data: m.content });
    }
  }
  return out;
}
