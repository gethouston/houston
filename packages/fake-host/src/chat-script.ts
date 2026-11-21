import type { PendingInteraction } from "@houston/protocol";
import { takeToolCalls } from "./chat-tools";
import { MARKDOWN_SHOWCASE } from "./markdown-showcase";

let nextInteraction: PendingInteraction | null = null;
export function setNextInteraction(pi: PendingInteraction | null): void {
  nextInteraction = pi;
}

let nextReplyText: string | null = null;
export function setNextReplyText(text: string | null): void {
  nextReplyText = text;
}

export function cannedReply(userText: string): string {
  if (nextReplyText !== null) {
    const reply = nextReplyText;
    nextReplyText = null;
    return reply;
  }
  if (/markdown/i.test(userText)) return MARKDOWN_SHOWCASE;
  return `Roger that. You said: "${userText}"`;
}

export function replyDeltas(reply: string): string[] {
  const third = Math.ceil(reply.length / 3);
  return [
    reply.slice(0, third),
    reply.slice(third, third * 2),
    reply.slice(third * 2),
  ];
}

export function takeInteraction(): PendingInteraction | null {
  const interaction = nextInteraction;
  nextInteraction = null;
  return interaction;
}

export function resetScript(): void {
  nextInteraction = null;
  nextReplyText = null;
  takeToolCalls();
}
