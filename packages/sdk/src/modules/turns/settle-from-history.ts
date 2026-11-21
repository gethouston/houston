import { type ChatMessage, EngineError } from "@houston/runtime-client";
import { adoptReply } from "./adopt-reply";
import { conclusiveReply, turnReply } from "./conclusive-reply";
import { TURN_DIED_MESSAGE } from "./turn-errors";
import { finishErr, finishOk, push, type TurnState } from "./turn-settle";

export { TURN_DIED_MESSAGE } from "./turn-errors";

export function settleFromHistory(
  s: TurnState,
  messages: ChatMessage[] | null,
  turnId: string | undefined,
  guard: (messages: ChatMessage[]) => boolean,
  onAdoptTurnId?: (turnId: string) => void,
): void {
  if (messages && turnId) {
    const reply = turnReply(messages, turnId);
    if (reply) {
      adoptReply(s, reply, onAdoptTurnId);
      return;
    }
    finishErr(s, TURN_DIED_MESSAGE);
    return;
  }
  if (messages) {
    const reply = conclusiveReply(messages, undefined, guard);
    if (reply) {
      adoptReply(s, reply, onAdoptTurnId);
      return;
    }
  }
  if (s.text) finishOk(s);
  else finishErr(s, TURN_DIED_MESSAGE);
}

export async function presettleFromHistory(
  s: TurnState,
  reloadHistory: () => Promise<ChatMessage[]>,
  turnId: string | undefined,
  guard: (messages: ChatMessage[]) => boolean,
  hasEvidence: () => boolean,
  onAdoptTurnId?: (turnId: string) => void,
): Promise<PresettleVerdict> {
  let messages: ChatMessage[];
  try {
    messages = await reloadHistory();
  } catch (e) {
    if (s.settled || hasEvidence()) return "pending";
    return e instanceof EngineError && e.status === 404 ? "gone" : "pending";
  }
  if (s.settled || hasEvidence()) return "pending";
  const reply = conclusiveReply(messages, turnId, guard);
  if (!reply) return "pending";
  adoptReply(s, reply, onAdoptTurnId);
  return "settled";
}

export type PresettleVerdict = "settled" | "pending" | "gone";

export async function reloadAndSettle(
  s: TurnState,
  reloadHistory: () => Promise<ChatMessage[]>,
  turnId: string | undefined,
  guard: (messages: ChatMessage[]) => boolean,
  stop: () => void,
  onAdoptTurnId?: (turnId: string) => void,
  live: () => boolean = () => true,
): Promise<void> {
  let messages: ChatMessage[] | null = null;
  try {
    messages = await reloadHistory();
  } catch (e) {
    if (!live()) return;
    push(s, {
      feed_type: "system_message",
      data: `Couldn't reload the conversation: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  if (!live()) return;
  if (!s.settled) settleFromHistory(s, messages, turnId, guard, onAdoptTurnId);
  stop();
}
