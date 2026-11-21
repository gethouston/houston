import type { ChatMessage, ToolEntry } from "./feed-to-messages";
import { isOfferTool } from "./tool-labels.ts";

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
      offersOnly: boolean;
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
  return `process-${segments[0]?.key ?? "empty"}`;
}

function isOffersOnly(segments: ChatProcessSegment[]): boolean {
  return segments.every(
    (segment) =>
      !segment.reasoning &&
      segment.tools.length > 0 &&
      segment.tools.every((tool) => isOfferTool(tool.name)),
  );
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
      offersOnly: isOffersOnly(pending),
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

export function shouldShowThinkingIndicator(
  items: ChatDisplayItem[],
  status: ChatStatus,
): boolean {
  if (status !== "submitted") return false;
  const last = items[items.length - 1];
  if (last?.kind === "process" && last.isActive) return false;
  return !progressCardTrails(items);
}

function progressCardTrails(items: ChatDisplayItem[]): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind !== "message") return false;
    if (item.message.hostCard)
      return item.message.hostCard.ownsProgress === true;
    if (item.message.from !== "assistant" || item.message.isStreaming)
      return false;
  }
  return false;
}
