/**
 * Per-conversation chat history — the user message persists at turn START and
 * the assistant reply at turn END, both stamped with the turn's id, matching
 * the real runtime's dead-turn history shape.
 */

import type { ChatMessage } from "@houston/runtime-client";
import { EPOCH, emitDomain, SEED_USAGE, state } from "./state-store";

export function getHistory(
  agentId: string,
  conversationId: string,
): ChatMessage[] {
  return state.histories.get(`${agentId}:${conversationId}`) ?? [];
}
/**
 * Replace a conversation's transcript wholesale — the `/__test__/chat-history`
 * arming control. Specs use it to reach a shape no scripted turn can produce
 * locally: a SHARED conversation whose user messages carry the `author` the
 * gateway stamps in multiplayer (the sender-attribution spec). The messages are
 * stored verbatim, so the history route serves exactly the wire shape given.
 */
export function seedHistory(
  agentId: string,
  conversationId: string,
  messages: ChatMessage[],
): ChatMessage[] {
  state.histories.set(`${agentId}:${conversationId}`, [...messages]);
  emitDomain("ConversationsChanged", agentId);
  return messages;
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
  displayText?: string,
  mentions?: ChatMessage["mentions"],
): void {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  // `displayText` mirrors the real runtime's contract: the model ran on
  // `content` (a kickoff send carries the full hidden directive there), while
  // a history reload renders `displayText ?? content`. Dropping it here made
  // the served fold DIFFER from the live bubble — a windowed reseed
  // (HOU-819) then replaced the pretty bubble with the raw directive.
  // `mentions` persists beside it the way the real runtime persists `author`:
  // a reloaded transcript must chip the same teammates the live bubble did.
  list.push({
    role: "user",
    content: userText,
    ts: EPOCH,
    turnId,
    ...(displayText !== undefined ? { displayText } : {}),
    ...(mentions ? { mentions } : {}),
  });
  state.histories.set(key, list);
  emitDomain("ConversationsChanged", agentId);
}

/**
 * Append the durable "stopped by user" marker the dismiss/abandon path writes:
 * an empty assistant message flagged `stopped`, mirroring the real runtime's
 * dismiss-interaction passthrough. A reloaded transcript then shows the stop
 * line instead of rendering the interrupted turn as a plain successful finish.
 */
export function appendStoppedMessage(
  agentId: string,
  conversationId: string,
): void {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  list.push({ role: "assistant", content: "", ts: EPOCH, stopped: true });
  state.histories.set(key, list);
  emitDomain("ConversationsChanged", agentId);
}

/**
 * Persist the assistant reply at turn END, stamped with the same turn id.
 * A turn that ended on an interaction persists it ON the reply, matching the
 * real runtime (`exec-turn.ts` clean path) — so a client that settles from
 * history (the terminal frame lost, or the turn completed before its
 * subscription attached) still recovers the card that rides the `needs_you`
 * settle.
 */
export function appendAssistantMessage(
  agentId: string,
  conversationId: string,
  replyText: string,
  turnId: string,
  pendingInteraction: ChatMessage["pendingInteraction"] | null = null,
): void {
  const key = `${agentId}:${conversationId}`;
  const list = state.histories.get(key) ?? [];
  list.push({
    role: "assistant",
    content: replyText,
    ts: EPOCH,
    usage: SEED_USAGE,
    turnId,
    ...(pendingInteraction ? { pendingInteraction } : {}),
  });
  state.histories.set(key, list);
  emitDomain("ConversationsChanged", agentId);
}
