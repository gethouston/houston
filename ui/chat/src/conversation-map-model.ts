import type { ChatMessage } from "./feed-to-messages";
import { messagePreviewText } from "./message-preview.ts";

export type ConversationMomentType =
  | "user"
  | "assistant"
  | "artifact"
  | "error";

export interface ConversationMoment {
  id: string;
  messageKey: string;
  type: ConversationMomentType;
  preview: string;
  position: number;
}

const MAX_MOMENTS = 24;
const PREVIEW_LENGTH = 96;

/** Derives a compact navigation index from the messages currently rendered. */
export function deriveConversationMoments(
  messages: ChatMessage[],
): ConversationMoment[] {
  const moments = messages.flatMap((message, index) => {
    const type = momentTypeFor(message);
    if (!type) return [];
    return [
      {
        id: message.key,
        messageKey: message.key,
        type,
        preview: previewFor(message.content),
        position: index + 1,
      },
    ];
  });

  return capMoments(moments);
}

function momentTypeFor(message: ChatMessage): ConversationMomentType | null {
  if (message.runtimeError || message.providerError) return "error";
  if (message.from === "user" && message.content) return "user";
  if (message.from === "assistant" && message.fileChanges.length > 0)
    return "artifact";
  if (message.from === "assistant" && message.content) return "assistant";
  return null;
}

function previewFor(content: string): string {
  // Decode Skill / attachment / interaction-answers markers so the map never
  // leaks raw marker JSON; plain assistant/user text passes through unchanged.
  const decoded = messagePreviewText(content);
  const normalized = decoded.replace(/\s+/g, " ").trim();
  if (normalized.length <= PREVIEW_LENGTH) return normalized;
  return `${normalized.slice(0, PREVIEW_LENGTH - 3)}...`;
}

function capMoments(moments: ConversationMoment[]): ConversationMoment[] {
  if (moments.length <= MAX_MOMENTS) return moments;

  const selected = new Map<number, ConversationMoment>();
  const important = moments.filter(
    (moment) => moment.type === "artifact" || moment.type === "error",
  );
  const first = moments[0];
  const last = moments.at(-1);
  if (!first || !last) return moments;

  selected.set(first.position, first);
  selected.set(last.position, last);
  for (const moment of important) {
    if (selected.size === MAX_MOMENTS) break;
    selected.set(moment.position, moment);
  }
  for (let slot = 0; slot < MAX_MOMENTS; slot += 1) {
    if (selected.size === MAX_MOMENTS) break;
    const index = Math.round((slot * (moments.length - 1)) / (MAX_MOMENTS - 1));
    selected.set(moments[index].position, moments[index]);
  }
  for (const moment of moments) {
    if (selected.size === MAX_MOMENTS) break;
    selected.set(moment.position, moment);
  }

  return [...selected.values()].sort((a, b) => a.position - b.position);
}
