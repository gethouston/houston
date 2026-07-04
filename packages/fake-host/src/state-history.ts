/**
 * Per-conversation chat history — the user message persists at turn START and
 * the assistant reply at turn END, both stamped with the turn's id, matching
 * the real runtime's dead-turn history shape.
 */

import type { ChatMessage } from "@houston/runtime-client";
import { EPOCH, SEED_USAGE, state } from "./state-store";

export function getHistory(
  agentId: string,
  conversationId: string,
): ChatMessage[] {
  return state.histories.get(`${agentId}:${conversationId}`) ?? [];
}
/**
 * Persist the turn's user message at turn START, stamped with the turn's id —
 * matching the real runtime, so a turn that dies before replying leaves
 * exactly the user message behind (the dead-turn history shape).
 */
export function appendUserMessage(
  agentId: string,
  conversationId: string,
  userText: string,
  turnId: string,
): void {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  list.push({ role: "user", content: userText, ts: EPOCH, turnId });
  state.histories.set(key, list);
}

/** Persist the assistant reply at turn END, stamped with the same turn id. */
export function appendAssistantMessage(
  agentId: string,
  conversationId: string,
  replyText: string,
  turnId: string,
): void {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  list.push({
    role: "assistant",
    content: replyText,
    ts: EPOCH,
    usage: SEED_USAGE,
    turnId,
  });
  state.histories.set(key, list);
}
