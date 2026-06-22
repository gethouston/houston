import { EngineError } from "@houston/runtime-client";
import type {
  HoustonEngineClient,
  ChatMessage,
  TokenUsage,
  WireEvent,
} from "@houston/runtime-client";
import type { ChatHistoryEntry } from "../../../../ui/engine-client/src/types";
import { emitEvent } from "./bus";

/**
 * A turn that fails on the SEND (e.g. no provider connected → the runtime answers
 * 409) rejects with an EngineError wrapping the runtime's JSON body. Unwrap it to
 * the plain message the engine sent, so the chat shows "No provider connected. Log
 * in with Claude or Codex first." rather than a raw `engine request failed (409):
 * {…}` string (the product voice never shows status codes or JSON to the user).
 */
export function turnErrorMessage(e: unknown): string {
  if (e instanceof EngineError) {
    try {
      const body = JSON.parse(e.body) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* body wasn't JSON — fall through to the generic message */
    }
  }
  return e instanceof Error ? e.message : String(e);
}

function feed(agentPath: string, sessionKey: string, item: unknown): void {
  emitEvent("FeedItem", {
    agent_path: agentPath,
    session_key: sessionKey,
    item,
  });
}
function sessionStatus(
  agentPath: string,
  sessionKey: string,
  status: string,
  error?: string,
): void {
  emitEvent("SessionStatus", {
    agent_path: agentPath,
    session_key: sessionKey,
    status,
    error,
  });
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
  setActivityStatus: (status: string) => Promise<void>,
): Promise<void> {
  // Persist a board-card status through the SAME (cloud-aware) seam the board
  // READS from. In cloud mode the board reads activities off the host, so this
  // write MUST reach the host too; a localStorage write would never show up and
  // the card would hang in "running" forever. A failed persist surfaces in the
  // feed, never swallowed.
  const persistStatus = async (status: string): Promise<void> => {
    try {
      await setActivityStatus(status);
    } catch (e) {
      feed(agentPath, sessionKey, {
        feed_type: "system_message",
        data: `Couldn't update the board status: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  sessionStatus(agentPath, sessionKey, "running");
  // Flip the card to "running" for this turn (re-running a needs_you/done
  // activity must reset it). Fire concurrently so it never delays turn start;
  // persistStatus surfaces its own failure, so this can't become an unhandled
  // rejection.
  void persistStatus("running");

  let text = "";
  let thinking = "";
  // Normalized token usage for the turn, carried on the `usage` frame the engine
  // emits before `done`. Attached to the `final_result` so the context-usage
  // indicator can read it.
  let usage: TokenUsage | null = null;
  let settled = false;
  // Terminal board status, persisted once the turn settles (NOT mid-stream) so
  // the write is awaited and a failure is surfaced.
  let terminal: "needs_you" | "error" | null = null;
  const ac = new AbortController();

  const finishOk = (): void => {
    if (settled) return;
    settled = true;
    if (thinking)
      feed(agentPath, sessionKey, { feed_type: "thinking", data: thinking });
    if (text)
      feed(agentPath, sessionKey, { feed_type: "assistant_text", data: text });
    feed(agentPath, sessionKey, {
      feed_type: "final_result",
      data: { result: text, cost_usd: null, duration_ms: null, usage },
    });
    sessionStatus(agentPath, sessionKey, "completed");
    terminal = "needs_you";
  };
  const finishErr = (msg: string): void => {
    if (settled) return;
    settled = true;
    feed(agentPath, sessionKey, { feed_type: "system_message", data: msg });
    sessionStatus(agentPath, sessionKey, "error", msg);
    terminal = "error";
  };

  const onEvent = (ev: WireEvent): void => {
    switch (ev.type) {
      case "sync":
        // Reconnect catch-up: seed an in-flight assistant partial. A fresh turn's
        // first `sync` is empty (running:false); the terminal state always
        // arrives as `done`, so never treat `sync` itself as terminal.
        if (ev.data.running && ev.data.partial) {
          text = ev.data.partial;
          feed(agentPath, sessionKey, {
            feed_type: "assistant_text_streaming",
            data: text,
          });
        }
        break;
      case "user":
        // app/src already renders the user's message optimistically on send;
        // skip the engine's echo so it isn't shown twice.
        break;
      case "text":
        text += ev.data;
        feed(agentPath, sessionKey, {
          feed_type: "assistant_text_streaming",
          data: text,
        });
        break;
      case "thinking":
        thinking += ev.data;
        feed(agentPath, sessionKey, {
          feed_type: "thinking_streaming",
          data: thinking,
        });
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
      case "usage":
        // Stash the turn's usage; finishOk attaches it to the final_result.
        usage = ev.data;
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
    const streaming = engine.streamEvents(sessionKey, {
      signal: ac.signal,
      onEvent,
    });
    await engine.sendMessage(sessionKey, prompt);
    await streaming;
    // The stream closed without our abort (engine closed it) — finalize from
    // what we have so the UI never hangs in "running".
    finishOk();
  } catch (e) {
    // Our own abort after a terminal event is the expected teardown, not a
    // failure; anything else (send rejected, stream dropped) is a real error.
    // A rejected send (e.g. the runtime refusing a not-connected turn with 409)
    // lands here, stops the spinner, and shows the engine's plain message.
    if (!(ac.signal.aborted && settled)) {
      finishErr(turnErrorMessage(e));
    }
  } finally {
    ac.abort();
  }

  // Persist the terminal board status once the turn settled — awaited, through
  // the cloud-aware seam, so the card actually leaves "running" on the surface
  // the board reads.
  if (terminal) await persistStatus(terminal);
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
        out.push({
          feed_type: "tool_result",
          data: { content: "", is_error: !!t.isError },
        });
      }
      if (m.content) out.push({ feed_type: "assistant_text", data: m.content });
      // Replay the turn's usage as a final_result (which only flushes, never
      // renders a bubble) so the context-usage indicator survives a reload.
      if (m.usage) {
        out.push({
          feed_type: "final_result",
          data: {
            result: m.content,
            cost_usd: null,
            duration_ms: null,
            usage: m.usage,
          },
        });
      }
    }
  }
  return out;
}
