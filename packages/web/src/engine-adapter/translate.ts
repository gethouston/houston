import type { HoustonEngineClient, ChatMessage } from "@houston/engine-client";
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
 * Run one turn against the new engine, translating its SSE `WireEvent` stream
 * into the old engine's `FeedItem` + `SessionStatus` events on the bus. The
 * old engine emitted *accumulated* streaming text, and `mergeFeedItem` replaces
 * the live streaming item in place — so we accumulate here too.
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
  try {
    for await (const ev of engine.streamMessage(sessionKey, prompt)) {
      switch (ev.type) {
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
          feed(agentPath, sessionKey, { feed_type: "system_message", data: ev.data.message });
          break;
        case "done":
          break;
      }
    }
    if (thinking) feed(agentPath, sessionKey, { feed_type: "thinking", data: thinking });
    if (text) feed(agentPath, sessionKey, { feed_type: "assistant_text", data: text });
    feed(agentPath, sessionKey, {
      feed_type: "final_result",
      data: { result: text, cost_usd: null, duration_ms: null },
    });
    sessionStatus(agentPath, sessionKey, "completed");
    setStatusBySessionKey(agentPath, sessionKey, "needs_you");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    feed(agentPath, sessionKey, { feed_type: "system_message", data: msg });
    sessionStatus(agentPath, sessionKey, "error", msg);
    setStatusBySessionKey(agentPath, sessionKey, "error");
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
