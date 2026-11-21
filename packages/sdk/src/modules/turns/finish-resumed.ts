import { setReplyPhase } from "./reply-phase";
import { invisibleFinal, push, type TurnState } from "./turn-settle";
import { emitStatus } from "./turn-state";

export function finishResumed(s: TurnState, msg: string): void {
  if (s.settled) return;
  if (s.replyComplete) setReplyPhase(s, false);
  s.settled = true;
  if (s.thinking) push(s, { feed_type: "thinking", data: s.thinking });
  if (s.text) push(s, { feed_type: "assistant_text", data: s.text });
  push(s, { feed_type: "system_message", data: msg, notice: "engine_resumed" });
  s.firstResponse?.resolve("interrupted", s.turnId);
  invisibleFinal(s);
  emitStatus(s, "completed");
}
