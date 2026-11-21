import type { Message } from "@earendil-works/pi-ai";
import type { ChatFeedRow, SessionPair, TranscriptMessage } from "./types";

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

export function rowTs(row: ChatFeedRow): number {
  const t = Date.parse(row.timestamp);
  return Number.isNaN(t) ? 0 : t;
}

export function reconstruct(rows: ChatFeedRow[]): {
  transcript: TranscriptMessage[];
  sessionPairs: SessionPair[];
} {
  const transcript: TranscriptMessage[] = [];
  const sessionPairs: SessionPair[] = [];

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
          ? (obj?.created as unknown[])
          : [];
        const modified = Array.isArray(obj?.modified)
          ? (obj?.modified as unknown[])
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

export const IMPORTED_HISTORY_NOTE =
  "[Imported history] The messages above were imported from my previous " +
  "Houston installation. They are a read-only record of past conversations, " +
  "not pending work: do not resume, redo, or undo anything mentioned in them " +
  "(deleting routines or files, sending anything, changing settings) unless " +
  "I ask again in a new message after this one.";

export function importedHistoryNote(ts: number): Message {
  return {
    role: "user",
    content: IMPORTED_HISTORY_NOTE,
    timestamp: ts || Date.now(),
  };
}

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

export function titleFor(transcript: TranscriptMessage[]): string {
  const firstUser = transcript.find(
    (m) => m.role === "user" && m.content.trim().length > 0,
  );
  return (firstUser?.content.trim().slice(0, 60) || "Imported chat").replace(
    /\s+/g,
    " ",
  );
}
