import type { Message } from "@earendil-works/pi-ai";
import type { ChatFeedRow, SessionPair, TranscriptMessage } from "./types";

/**
 * Rust `chat_feed` rows → the two migration artifacts, plus the pi-ai Message
 * synthesis the agent-memory side needs.
 *
 * Fidelity split (the honest, unavoidable cross-engine tradeoff):
 *  - The TRANSCRIPT renders the FULL feed (user / assistant / tool calls / tool
 *    results / thinking / file changes / final result), read-only.
 *  - The agent's MEMORY (the pi session) gets plain user/assistant TEXT pairs
 *    only — tool-call and thinking blocks can't transfer between engines.
 */

/** Decode a `data_json` that is a JSON-encoded string (user/assistant/thinking
 * chunks). Returns "" for anything unexpected rather than throwing. */
function decodeJsonString(json: string): string {
  try {
    const v = JSON.parse(json);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function decodeObject<T>(json: string): T | null {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

/** Parse a row timestamp to epoch ms; falls back to 0 (caller breaks ties on the
 * row id) when the string is unparseable so a conversation never loses order. */
export function rowTs(row: ChatFeedRow): number {
  const t = Date.parse(row.timestamp);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * One conversation's chat_feed rows (already ordered) → `{ transcript,
 * sessionPairs }`.
 *
 * A "turn" boundary is a `final_result` (the clean, complete assistant text) or,
 * lacking one, the concatenation of the `assistant_text` streaming chunks since
 * the last user message. Tool/thinking/file/error items render in the transcript
 * but never enter the session.
 */
export function reconstruct(rows: ChatFeedRow[]): {
  transcript: TranscriptMessage[];
  sessionPairs: SessionPair[];
} {
  const transcript: TranscriptMessage[] = [];
  const sessionPairs: SessionPair[] = [];

  // Buffer assistant streaming chunks for the no-final_result fallback.
  let pendingAssistant = "";
  let pendingAssistantTs = 0;
  const flushPendingAssistant = () => {
    if (pendingAssistant) {
      sessionPairs.push({
        role: "assistant",
        content: pendingAssistant,
        ts: pendingAssistantTs,
      });
      pendingAssistant = "";
      pendingAssistantTs = 0;
    }
  };

  for (const row of rows) {
    const ts = rowTs(row);
    switch (row.feed_type) {
      case "user_message": {
        // A new user turn closes any buffered (final_result-less) assistant turn.
        flushPendingAssistant();
        const text = decodeJsonString(row.data_json);
        transcript.push({ role: "user", content: text, ts });
        sessionPairs.push({ role: "user", content: text, ts });
        break;
      }
      case "assistant_text": {
        const chunk = decodeJsonString(row.data_json);
        transcript.push({ role: "assistant", content: chunk, ts });
        if (!pendingAssistant) pendingAssistantTs = ts;
        pendingAssistant += chunk;
        break;
      }
      case "final_result": {
        const obj = decodeObject<{ result?: unknown }>(row.data_json);
        const result = obj && typeof obj.result === "string" ? obj.result : "";
        transcript.push({ role: "assistant", content: result, ts });
        // final_result wins over the streamed chunks for the agent's memory.
        pendingAssistant = "";
        pendingAssistantTs = 0;
        if (result)
          sessionPairs.push({ role: "assistant", content: result, ts });
        break;
      }
      case "tool_call": {
        const obj = decodeObject<{ name?: unknown; input?: unknown }>(
          row.data_json,
        );
        const name = obj && typeof obj.name === "string" ? obj.name : "tool";
        const input = obj ? obj.input : undefined;
        const args = input == null ? "" : `\n${JSON.stringify(input, null, 2)}`;
        transcript.push({
          role: "assistant",
          content: `[tool: ${name}]${args}`,
          ts,
          tools: [{ name }],
        });
        break;
      }
      case "tool_result": {
        const obj = decodeObject<{ content?: unknown; is_error?: unknown }>(
          row.data_json,
        );
        const content =
          obj && typeof obj.content === "string" ? obj.content : "";
        const isError = !!obj?.is_error;
        transcript.push({
          role: "assistant",
          content: `[tool result]\n${content}`,
          ts,
          tools: [{ name: "result", isError }],
        });
        break;
      }
      case "thinking": {
        const text = decodeJsonString(row.data_json);
        transcript.push({
          role: "assistant",
          content: `[thinking]\n${text}`,
          ts,
        });
        break;
      }
      case "file_changes": {
        const obj = decodeObject<{ created?: unknown; modified?: unknown }>(
          row.data_json,
        );
        const created = Array.isArray(obj?.created)
          ? (obj!.created as unknown[])
          : [];
        const modified = Array.isArray(obj?.modified)
          ? (obj!.modified as unknown[])
          : [];
        const lines: string[] = [];
        for (const f of created) lines.push(`created ${String(f)}`);
        for (const f of modified) lines.push(`modified ${String(f)}`);
        transcript.push({
          role: "assistant",
          content: `[file changes]\n${lines.join("\n")}`,
          ts,
        });
        break;
      }
      case "provider_error": {
        const obj = decodeObject<{ kind?: unknown; provider?: unknown }>(
          row.data_json,
        );
        const kind = obj && typeof obj.kind === "string" ? obj.kind : "error";
        const provider =
          obj && typeof obj.provider === "string" ? obj.provider : "";
        transcript.push({
          role: "assistant",
          content: `[provider ${provider} ${kind}]`,
          ts,
          tools: [{ name: "provider_error", isError: true }],
        });
        break;
      }
      default:
        // Unknown feed_type: keep it in the transcript so nothing is silently
        // dropped, but never feed it to the session.
        transcript.push({
          role: "assistant",
          content: `[${row.feed_type}]`,
          ts,
        });
        break;
    }
  }
  flushPendingAssistant();
  return { transcript, sessionPairs };
}

/**
 * A pi-ai Message for one user/assistant pair. The literals mirror exactly what
 * packages/runtime/src/session/resume.test.ts proves restores via
 * continueRecent() (same field set the SDK persists for a real turn).
 */
export function messageFor(p: SessionPair): Message {
  if (p.role === "user") {
    return { role: "user", content: p.content, timestamp: p.ts || Date.now() };
  }
  return {
    role: "assistant",
    content: [{ type: "text", text: p.content }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: p.ts || Date.now(),
  };
}

/** First non-empty user line, trimmed + collapsed, as the conversation title. */
export function titleFor(transcript: TranscriptMessage[]): string {
  const firstUser = transcript.find(
    (m) => m.role === "user" && m.content.trim().length > 0,
  );
  return (firstUser?.content.trim().slice(0, 60) || "Imported chat").replace(
    /\s+/g,
    " ",
  );
}
