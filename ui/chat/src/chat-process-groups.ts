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

function processKey(segments: ChatProcessSegment[]): string {
  const first = segments[0]?.key ?? "empty";
  const last = segments[segments.length - 1]?.key ?? first;
  return `process-${first}-${last}`;
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
    const messageHasContent = message.content.length > 0;

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
      items.push({ kind: "message", message, sourceIndex });
    }
  }

  flushProcess(status !== "ready", true);
  return items;
}

export function shouldShowThinkingIndicator(
  items: ChatDisplayItem[],
  status: ChatStatus,
): boolean {
  if (status !== "submitted") return false;
  const last = items[items.length - 1];
  return !(last?.kind === "process" && last.isActive);
}
