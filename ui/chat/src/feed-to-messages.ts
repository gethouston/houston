import { attachToolResult } from "./feed-tool-result";
import type {
  FeedItem,
  HostCard,
  MessageAuthor,
  MessageMention,
  ProviderError,
  SystemNoticeKind,
} from "./types";

export interface ToolEntry {
  name: string;
  input?: unknown;
  result?: {
    content: string;
    is_error: boolean;
    mission?: { id: string; title: string; agent: string };
  };
}

export interface FileChangeEntry {
  path: string;
  status: "created" | "modified";
}

/** Marks a `from: "system"` message as a boundary divider — a context
 *  compaction, a mid-session provider switch, or a cleared context. */
export interface ChatCompactionInfo {
  /** What produced this divider. */
  kind: "compacted" | "provider_switch" | "context_cleared";
  /** Compaction trigger. Set only when `kind === "compacted"`. */
  trigger?: "native" | "proactive" | "manual";
  /** Provider switched TO. Set only when `kind === "provider_switch"`. */
  provider?: string;
  /** Whether a switch summarized prior context (`true`) or carried the full
   *  conversation verbatim (`false`). Set only when `kind === "provider_switch"`. */
  summarized?: boolean;
  preTokens?: number;
}

export interface ChatMessage {
  key: string;
  from: "user" | "assistant" | "system";
  content: string;
  isStreaming: boolean;
  reasoning?: { content: string; isStreaming: boolean };
  tools: ToolEntry[];
  /**
   * Typed provider failure (rate-limited, auth-expired, quota-exhausted,
   * etc). When set, the consumer should render a variant-specific card
   * instead of plain text.
   */
  providerError?: ProviderError;
  fileChanges: FileChangeEntry[];
  /** Source channel if the message came from an external channel. */
  source?: string;
  /**
   * Multiplayer only: who wrote this user message (C5). Present on
   * `from: "user"` messages in a shared conversation; absent in single-player
   * mode. The renderer shows a label only when the thread has ≥2 distinct
   * authors — see `distinctAuthorCount`.
   */
  author?: MessageAuthor;
  /**
   * Multiplayer only: the teammates this USER message @mentioned.
   * The renderer chips each "@Name" run it still finds in `content`; absent
   * when the message mentioned nobody.
   */
  mentions?: MessageMention[];
  /**
   * Set on `from: "system"` messages that mark a context-compaction boundary.
   * The renderer shows a subtle divider instead of plain system text.
   */
  compaction?: ChatCompactionInfo;
  /**
   * Set on `from: "system"` messages the engine authored for a known reason
   * (a restart, a resume). The renderer picks copy by kind; `content` is the
   * English default.
   */
  notice?: SystemNoticeKind;
  noticeData?: unknown;
  /** Set on `from: "system"` rows the host draws itself. */
  hostCard?: HostCard;
  /**
   * The wire id of the turn a `from: "user"` message started.
   * The edit-and-resend affordance anchors on it; absent on a still-optimistic
   * send and on pre-turn-id transcripts, which are not editable.
   */
  turnId?: string;
}

export function feedItemsToMessages(items: FeedItem[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let cur: ChatMessage | null = null;
  let seenProviderErrors = new Map<ProviderError["kind"], number>();
  let turnHadErrorCard = false;

  function getCur(): ChatMessage | null {
    return cur;
  }

  const flush = () => {
    if (cur) {
      messages.push(cur);
      cur = null;
    }
  };

  const keyFor = (kind: string, item: { id?: string }): string =>
    `${kind}-${item.id ?? messages.length}`;

  const ensureAssistant = (item: { id?: string }): ChatMessage => {
    if (cur?.from !== "assistant") {
      flush();
      cur = {
        key: keyFor("assistant", item),
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
        seenProviderErrors = new Map<ProviderError["kind"], number>();
        turnHadErrorCard = false;
        const { source, text } = extractSource(item.data);
        messages.push({
          key: keyFor("user", item),
          from: "user",
          content: text,
          isStreaming: false,
          tools: [],
          fileChanges: [],
          source,
          author: item.author,
          mentions: item.mentions,
          turnId: item.turnId,
        });
        break;
      }

      case "assistant_text": {
        const msg = ensureAssistant(item);
        msg.content = item.data;
        msg.isStreaming = false;
        flush();
        break;
      }

      case "assistant_text_streaming": {
        const msg = ensureAssistant(item);
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
        const msg = ensureAssistant(item);
        msg.reasoning = { content: item.data, isStreaming: isStream };
        if (isStream) msg.isStreaming = true;
        if (!isStream) flush();
        break;
      }

      case "tool_call": {
        const prev = getCur();
        if (prev && prev.from === "assistant" && prev.content) {
          flush();
        }
        const msg = ensureAssistant(item);
        const lastTool = msg.tools[msg.tools.length - 1];
        if (
          lastTool &&
          lastTool.name === item.data.name &&
          lastTool.input == null
        ) {
          lastTool.input = item.data.input;
        } else {
          msg.tools.push({ name: item.data.name, input: item.data.input });
        }
        if (!msg.content) msg.isStreaming = true;
        break;
      }

      case "tool_result": {
        attachToolResult(item, messages, getCur());
        break;
      }

      case "provider_error": {
        if (item.data.kind === "cancelled") break;
        turnHadErrorCard = true;
        const seenIndex = seenProviderErrors.get(item.data.kind);
        if (seenIndex !== undefined) {
          const seen = messages[seenIndex];
          if (seen.providerError && !seen.providerError.provider) {
            if (item.data.provider) {
              seen.providerError = {
                ...seen.providerError,
                provider: item.data.provider,
              };
            }
          }
          break;
        }
        flush();
        seenProviderErrors.set(item.data.kind, messages.length);
        messages.push({
          key: `${keyFor("provider-error", item)}-${item.data.kind}`,
          from: "system",
          content: "",
          isStreaming: false,
          providerError: item.data,
          tools: [],
          fileChanges: [],
        });
        break;
      }

      case "host_card": {
        flush();
        messages.push({
          key: keyFor("host-card", item),
          from: "system",
          content: "",
          isStreaming: false,
          tools: [],
          fileChanges: [],
          hostCard: item.data,
        });
        break;
      }

      case "system_message": {
        if (turnHadErrorCard && isSessionErrorEcho(item.data)) break;
        flush();
        messages.push({
          key: keyFor("system", item),
          from: "system",
          content: item.data,
          isStreaming: false,
          tools: [],
          fileChanges: [],
          ...(item.notice ? { notice: item.notice } : {}),
          ...(item.noticeData !== undefined
            ? { noticeData: item.noticeData }
            : {}),
        });
        break;
      }

      case "context_compacted": {
        flush();
        messages.push({
          key: keyFor("context-compacted", item),
          from: "system",
          content: "",
          isStreaming: false,
          tools: [],
          fileChanges: [],
          compaction: {
            kind: "compacted",
            trigger: item.data.trigger,
            preTokens: item.data.pre_tokens ?? undefined,
          },
        });
        break;
      }

      case "context_cleared": {
        flush();
        messages.push({
          key: keyFor("context-cleared", item),
          from: "system",
          content: "",
          isStreaming: false,
          tools: [],
          fileChanges: [],
          compaction: { kind: "context_cleared" },
        });
        break;
      }

      case "provider_switched": {
        flush();
        messages.push({
          key: keyFor("provider-switched", item),
          from: "system",
          content: "",
          isStreaming: false,
          tools: [],
          fileChanges: [],
          compaction: {
            kind: "provider_switch",
            provider: item.data.provider,
            summarized: item.data.summarized,
            preTokens: item.data.pre_tokens ?? undefined,
          },
        });
        break;
      }

      case "file_changes": {
        attachFileChanges([
          ...item.data.created.map((path) => ({
            path,
            status: "created" as const,
          })),
          ...item.data.modified.map((path) => ({
            path,
            status: "modified" as const,
          })),
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

/**
 * How many DISTINCT authors (by userId) wrote user messages in this thread.
 * The renderer shows author labels only when this is ≥2 — a single-author
 * conversation stays label-free (C5). Authorless user messages don't count.
 * Pure, so the threshold is unit-tested without rendering.
 */
export function distinctAuthorCount(messages: ChatMessage[]): number {
  const ids = new Set<string>();
  for (const m of messages) {
    if (m.from === "user" && m.author) ids.add(m.author.userId);
  }
  return ids.size;
}

function isSessionErrorEcho(text: string): boolean {
  return text.startsWith("Session error:");
}

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
