import type { ChatMessage, ToolEntry } from "./feed-to-messages";

type ChatStatus = "ready" | "streaming" | "submitted";

export interface ChatProcessSegment {
  key: string;
  sourceIndex: number;
  message: ChatMessage;
  reasoning?: ChatMessage["reasoning"];
  tools: ToolEntry[];
}

export type ChatDisplayItem =
  | { kind: "message"; message: ChatMessage; sourceIndex: number }
  | {
      kind: "process";
      key: string;
      segments: ChatProcessSegment[];
      isActive: boolean;
      isTrailing: boolean;
      sourceIndex: number;
    };

function hasProcess(message: ChatMessage): boolean {
  return Boolean(message.reasoning) || message.tools.length > 0;
}

function contentOnly(message: ChatMessage): ChatMessage {
  if (!hasProcess(message)) return message;
  return {
    ...message,
    key: `${message.key}-content`,
    reasoning: undefined,
    tools: [],
    fileChanges: [],
  };
}

function segmentFrom(
  message: ChatMessage,
  sourceIndex: number,
): ChatProcessSegment {
  return {
    key: message.key,
    sourceIndex,
    message,
    reasoning: message.reasoning,
    tools: message.tools,
  };
}

/**
 * HOU-717: keyed by the FIRST segment only. A streaming turn keeps appending
 * segments, so a key that also names the last segment changes on every new
 * thinking/tool block — React remounts the block and the user's open mission
 * log snaps shut mid-run. The first segment is fixed for the life of the
 * block (blocks flush on user/content boundaries, so no two share a first).
 */
function processKey(segments: ChatProcessSegment[]): string {
  return `process-${segments[0]?.key ?? "empty"}`;
}

export function getChatDisplayItems(
  messages: ChatMessage[],
  status: ChatStatus,
): ChatDisplayItem[] {
  const items: ChatDisplayItem[] = [];
  let pending: ChatProcessSegment[] = [];

  const flushProcess = (isActive: boolean, isTrailing: boolean) => {
    if (pending.length === 0) return;
    const lastSegment = pending[pending.length - 1];
    items.push({
      kind: "process",
      key: processKey(pending),
      segments: pending,
      isActive,
      isTrailing,
      sourceIndex: lastSegment.sourceIndex,
    });
    pending = [];
  };

  for (let sourceIndex = 0; sourceIndex < messages.length; sourceIndex++) {
    const message = messages[sourceIndex];
    if (message.from !== "assistant") {
      flushProcess(false, false);
      items.push({ kind: "message", message, sourceIndex });
      continue;
    }

    const messageHasProcess = hasProcess(message);
    const messageHasContent = message.content.trim().length > 0;

    if (messageHasProcess) {
      pending.push(segmentFrom(message, sourceIndex));
    }

    if (messageHasContent) {
      flushProcess(false, false);
      items.push({
        kind: "message",
        message: contentOnly(message),
        sourceIndex,
      });
    } else if (!messageHasProcess) {
      // Empty/whitespace-only assistant message with no reasoning and no
      // tools would render as a bare avatar + empty bubble (chat-messages.tsx
      // draws the Message wrapper, but its `{msg.content && ...}` body
      // collapses to nothing). Suppress it — UNLESS it is the actively
      // streaming final message, which legitimately starts empty
      // (assistant_text_streaming) and carries the typing/thinking affordance.
      const isStreamingTail =
        message.isStreaming && sourceIndex === messages.length - 1;
      if (isStreamingTail) {
        items.push({ kind: "message", message, sourceIndex });
      }
    }
  }

  flushProcess(status !== "ready", true);
  return items;
}

/**
 * HOU-471: the standalone "Mission in progress..." indicator is the only
 * in-flight signal during the gap before the agent's first output. Once an
 * active process block is on screen it ALREADY surfaces "Mission in progress:
 * <action>", so the standalone line would duplicate it. Show the indicator
 * only while a turn is `submitted` AND no active process block is trailing.
 */
export function shouldShowThinkingIndicator(
  items: ChatDisplayItem[],
  status: ChatStatus,
): boolean {
  if (status !== "submitted") return false;
  const last = items[items.length - 1];
  return !(last?.kind === "process" && last.isActive);
}
