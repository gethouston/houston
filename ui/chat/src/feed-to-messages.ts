/**
 * Convert FeedItem[] to ChatMessage[] for rendering.
 *
 * Groups consecutive feed items into logical messages, same as how
 * AI Elements structures its message list. Pairs tool_call items with
 * their corresponding tool_result items.
 */

import type { FeedItem, ProviderError, ToolRuntimeErrorEntry } from "./types";

export interface ToolEntry {
  name: string;
  input?: unknown;
  result?: { content: string; is_error: boolean };
}

export interface FileChangeEntry {
  path: string;
  status: "created" | "modified";
}

export interface ChatMessage {
  key: string;
  from: "user" | "assistant" | "system";
  content: string;
  isStreaming: boolean;
  reasoning?: { content: string; isStreaming: boolean };
  tools: ToolEntry[];
  runtimeError?: ToolRuntimeErrorEntry;
  /**
   * Typed provider failure (rate-limited, auth-expired, quota-exhausted,
   * etc). When set, the consumer should render a variant-specific card
   * instead of plain text.
   */
  providerError?: ProviderError;
  fileChanges: FileChangeEntry[];
  /** Source channel if the message came from an external channel. */
  source?: string;
}

export function feedItemsToMessages(items: FeedItem[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let cur: ChatMessage | null = null;

  function getCur(): ChatMessage | null {
    return cur;
  }

  const flush = () => {
    if (cur) {
      messages.push(cur);
      cur = null;
    }
  };

  const ensureAssistant = (): ChatMessage => {
    if (!cur || cur.from !== "assistant") {
      flush();
      cur = {
        key: `assistant-${messages.length}`,
        from: "assistant",
        content: "",
        isStreaming: false,
        tools: [],
        fileChanges: [],
      };
    }
    return cur;
  };

  const attachFileChanges = (changes: FileChangeEntry[]) => {
    const target =
      cur?.from === "assistant"
        ? cur
        : [...messages].reverse().find((msg) => msg.from === "assistant");
    if (!target) return;

    const seen = new Set(target.fileChanges.map((change) => change.path));
    for (const change of changes) {
      if (seen.has(change.path)) continue;
      seen.add(change.path);
      target.fileChanges.push(change);
    }
  };

  for (const item of items) {
    switch (item.feed_type) {
      case "user_message": {
        flush();
        const { source, text } = extractSource(item.data);
        messages.push({
          key: `user-${messages.length}`,
          from: "user",
          content: text,
          isStreaming: false,
          tools: [],
          fileChanges: [],
          source,
        });
        break;
      }

      case "assistant_text": {
        const msg = ensureAssistant();
        msg.content = item.data;
        msg.isStreaming = false;
        flush();
        break;
      }

      case "assistant_text_streaming": {
        const msg = ensureAssistant();
        msg.content = item.data;
        msg.isStreaming = true;
        break;
      }

      case "thinking_streaming":
      case "thinking": {
        const isStream = item.feed_type === "thinking_streaming";
        const prev = getCur();
        if (
          prev &&
          prev.from === "assistant" &&
          (prev.tools.length > 0 || prev.content)
        ) {
          flush();
        }
        const msg = ensureAssistant();
        msg.reasoning = { content: item.data, isStreaming: isStream };
        if (isStream) msg.isStreaming = true;
        if (!isStream) flush();
        break;
      }

      case "tool_call": {
        const msg = ensureAssistant();
        // Deduplicate: the parser emits two tool_calls per tool (null input
        // on block start, real input on block stop). Replace the placeholder.
        const lastTool = msg.tools[msg.tools.length - 1];
        if (lastTool && lastTool.name === item.data.name && lastTool.input == null) {
          lastTool.input = item.data.input;
        } else {
          msg.tools.push({ name: item.data.name, input: item.data.input });
        }
        if (!msg.content) msg.isStreaming = true;
        break;
      }

      case "tool_result": {
        // Find the most recent unmatched tool_call — it might be in the
        // current message OR in an already-flushed one (thinking blocks
        // can cause flushes between tool_call and tool_result).
        let matched = false;
        const active = getCur();
        if (active && active.from === "assistant") {
          for (let j = active.tools.length - 1; j >= 0; j--) {
            if (!active.tools[j].result) {
              active.tools[j].result = {
                content: item.data.content,
                is_error: item.data.is_error,
              };
              matched = true;
              break;
            }
          }
        }
        if (!matched) {
          // Search flushed messages backwards
          for (let m = messages.length - 1; m >= 0 && !matched; m--) {
            const msg = messages[m];
            if (msg.from !== "assistant") continue;
            for (let j = msg.tools.length - 1; j >= 0; j--) {
              if (!msg.tools[j].result) {
                msg.tools[j].result = {
                  content: item.data.content,
                  is_error: item.data.is_error,
                };
                matched = true;
                break;
              }
            }
          }
        }
        break;
      }

      case "tool_runtime_error": {
        flush();
        messages.push({
          key: `tool-runtime-error-${messages.length}`,
          from: "system",
          content: "A local tool failed to start.",
          isStreaming: false,
          runtimeError: item.data,
          tools: [],
          fileChanges: [],
        });
        break;
      }

      case "provider_error": {
        // Cancellation has no UI surface — the runner already signalled
        // SessionStatus::Cancelled via a separate channel, and a card
        // here would feel like a real error. Drop it.
        if (item.data.kind === "cancelled") break;
        flush();
        messages.push({
          key: `provider-error-${messages.length}-${item.data.kind}`,
          from: "system",
          // Empty content so the rendered message body collapses to the
          // typed card. The consumer (renderSystemMessage in the app)
          // detects providerError and routes to ProviderErrorCard.
          content: "",
          isStreaming: false,
          providerError: item.data,
          tools: [],
          fileChanges: [],
        });
        break;
      }

      case "system_message": {
        flush();
        messages.push({
          key: `system-${messages.length}`,
          from: "system",
          content: item.data,
          isStreaming: false,
          tools: [],
          fileChanges: [],
        });
        break;
      }

      case "file_changes": {
        attachFileChanges([
          ...item.data.created.map((path) => ({ path, status: "created" as const })),
          ...item.data.modified.map((path) => ({ path, status: "modified" as const })),
        ]);
        break;
      }

      case "final_result":
        flush();
        break;
    }
  }

  flush();
  return messages;
}

/** Extract a `[ChannelName]` prefix from a user message, if present. */
function extractSource(text: string): { source?: string; text: string } {
  const match = text.match(/^\[(\w+)\]\s*/);
  if (match) {
    return {
      source: match[1].toLowerCase(),
      text: text.slice(match[0].length),
    };
  }
  return { text };
}
