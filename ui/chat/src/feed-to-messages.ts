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
  /**
   * LLM-provided id from Anthropic's stream-json (and the matching field
   * on Gemini's tool events). When present we can pair `tool_call` rows
   * with their `tool_result` row deterministically, instead of relying on
   * the legacy "last unmatched tool" sequential heuristic. Optional only
   * because legacy `chat_feed` rows persisted before this field landed
   * have no id — those still fall back to sequential pairing.
   */
  tool_use_id?: string;
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
        const incomingId = item.data.tool_use_id;
        // Deduplicate: the parser emits two tool_calls per tool (null input
        // on block start, real input on block stop). Replace the placeholder.
        // When tool_use_id is present, pair by id; otherwise fall back to
        // the legacy "last tool with matching name and null input" heuristic.
        const lastTool = msg.tools[msg.tools.length - 1];
        const isFollowupForLast =
          !!lastTool &&
          ((incomingId && lastTool.tool_use_id === incomingId) ||
            (!incomingId && lastTool.name === item.data.name && lastTool.input == null));
        if (isFollowupForLast) {
          lastTool.input = item.data.input;
          // Stamp the id on first arrival (block_start may emit it before
          // block_stop on some parsers).
          if (!lastTool.tool_use_id && incomingId) {
            lastTool.tool_use_id = incomingId;
          }
        } else {
          msg.tools.push({
            name: item.data.name,
            input: item.data.input,
            tool_use_id: incomingId,
          });
        }
        if (!msg.content) msg.isStreaming = true;
        break;
      }

      case "tool_result": {
        const incomingId = item.data.tool_use_id;
        // Preferred: pair by tool_use_id. Falls back to sequential matching
        // (oldest unmatched tool) when the id is absent — true for legacy
        // chat_feed rows persisted before the field was added.
        const matchTool = (entry: ToolEntry): boolean => {
          if (entry.result) return false;
          if (incomingId && entry.tool_use_id) {
            return entry.tool_use_id === incomingId;
          }
          // Either side lacks an id — fall back to "any unresulted tool".
          return !incomingId || !entry.tool_use_id;
        };

        let matched = false;
        const active = getCur();
        if (active && active.from === "assistant") {
          for (let j = active.tools.length - 1; j >= 0; j--) {
            if (matchTool(active.tools[j])) {
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
          // Search flushed messages backwards.
          for (let m = messages.length - 1; m >= 0 && !matched; m--) {
            const msg = messages[m];
            if (msg.from !== "assistant") continue;
            for (let j = msg.tools.length - 1; j >= 0; j--) {
              if (matchTool(msg.tools[j])) {
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
