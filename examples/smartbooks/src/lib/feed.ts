/**
 * FeedItem typing mirrored from `houston-terminal-manager::FeedItem`.
 *
 * Wire shape (serde): `{ feed_type: <snake_case>, data: <payload> }`.
 * We only render a few variants explicitly — the rest fall through to
 * a generic gray label so we don't break on forward-compat additions.
 */

export type FeedItem =
  | { feed_type: "assistant_text"; data: string }
  | { feed_type: "assistant_text_streaming"; data: string }
  | { feed_type: "thinking"; data: string }
  | { feed_type: "thinking_streaming"; data: string }
  | { feed_type: "user_message"; data: string }
  | { feed_type: "tool_call"; data: { name: string; input: unknown } }
  | { feed_type: "tool_result"; data: { content: string; is_error: boolean } }
  | { feed_type: "system_message"; data: string }
  | {
      feed_type: "final_result";
      data: {
        result: string;
        cost_usd?: number | null;
        duration_ms?: number | null;
      };
    };

/** HoustonEvent shape — engine-protocol::HoustonEvent. */
export type HoustonEvent =
  | {
      type: "FeedItem";
      data: { agent_path: string; session_key: string; item: FeedItem };
    }
  | {
      type: "SessionStatus";
      data: {
        agent_path: string;
        session_key: string;
        status: string;
        error: string | null;
      };
    }
  | { type: "FilesChanged"; data: { agent_path: string } }
  | { type: "AuthRequired"; data: { provider: string; message: string } }
  | { type: string; data: unknown }; // forward-compat

/**
 * Reducer: collapse the streaming deltas into a single running message so
 * we don't re-render a thousand entries for every token.
 *
 * Rule: `assistant_text_streaming` updates an in-progress draft; the
 * matching `assistant_text` final replaces the draft. `thinking_streaming`
 * works the same way but with a separate bucket.
 */
export interface Message {
  id: string;
  kind: "user" | "assistant" | "thinking" | "tool" | "system" | "final";
  text: string;
  toolName?: string;
  error?: boolean;
  streaming?: boolean;
}

export function appendFeedItem(prev: Message[], item: FeedItem): Message[] {
  switch (item.feed_type) {
    case "user_message":
      return [
        ...prev,
        { id: crypto.randomUUID(), kind: "user", text: item.data },
      ];
    case "assistant_text_streaming": {
      const last = prev[prev.length - 1];
      if (last && last.kind === "assistant" && last.streaming) {
        const copy = prev.slice(0, -1);
        return [...copy, { ...last, text: item.data }];
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "assistant",
          text: item.data,
          streaming: true,
        },
      ];
    }
    case "assistant_text": {
      const last = prev[prev.length - 1];
      if (last && last.kind === "assistant" && last.streaming) {
        const copy = prev.slice(0, -1);
        return [...copy, { ...last, text: item.data, streaming: false }];
      }
      return [
        ...prev,
        { id: crypto.randomUUID(), kind: "assistant", text: item.data },
      ];
    }
    case "thinking_streaming": {
      const last = prev[prev.length - 1];
      if (last && last.kind === "thinking" && last.streaming) {
        const copy = prev.slice(0, -1);
        return [...copy, { ...last, text: item.data }];
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "thinking",
          text: item.data,
          streaming: true,
        },
      ];
    }
    case "thinking":
      return [
        ...prev,
        { id: crypto.randomUUID(), kind: "thinking", text: item.data },
      ];
    case "tool_call":
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "tool",
          text: summarizeInput(item.data.input),
          toolName: item.data.name,
        },
      ];
    case "tool_result":
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "tool",
          text: item.data.content.slice(0, 280),
          toolName: "result",
          error: item.data.is_error,
        },
      ];
    case "system_message":
      return [
        ...prev,
        { id: crypto.randomUUID(), kind: "system", text: item.data },
      ];
    case "final_result":
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "final",
          text:
            item.data.duration_ms != null
              ? `Done in ${(item.data.duration_ms / 1000).toFixed(1)}s`
              : "Done",
        },
      ];
    default:
      return prev;
  }
}

function summarizeInput(input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const rec = input as Record<string, unknown>;
  if (typeof rec.file_path === "string") return rec.file_path as string;
  if (typeof rec.path === "string") return rec.path as string;
  if (typeof rec.command === "string") return rec.command as string;
  if (typeof rec.pattern === "string") return rec.pattern as string;
  return "";
}
