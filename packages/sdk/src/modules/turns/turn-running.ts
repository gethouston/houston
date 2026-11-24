import { EngineError } from "@houston/runtime-client";
import { COMPUTE_BUSY_MESSAGE, computeBusyRefusal } from "./send-busy";
import {
  type EngineNoticeKind,
  engineVerdictMessage,
  turnErrorMessage,
} from "./turn-errors";

/**
 * The runtime refused a control because a turn is accepted, queued or running
 * on the conversation (`409 turn running`, its one 409). For a dismiss this
 * means the card the surface showed was stale: a turn started elsewhere (a
 * member's send, another device, a routine, a webhook) had already retired
 * that interaction, so nothing broke and the running turn is the truth the
 * surface must catch up to. Read by `dismissInteraction`, which turns it into
 * a typed outcome instead of a throw. For a
 * send it means the message must wait (`send-hold.ts`). Keyed on the reason
 * as well as the status: a send's 409 can also be the runtime's "no provider
 * connected" refusal, which is a real failure.
 */
export function isTurnRunningRejection(e: unknown): boolean {
  return (
    e instanceof EngineError &&
    e.status === 409 &&
    engineVerdictMessage(e) === TURN_RUNNING_REASON
  );
}

const TURN_RUNNING_REASON = "turn running";

export const SEND_BUSY_MESSAGE =
  "The agent is still busy with another message. Send yours again in a moment.";

export function sendRefusal(e: unknown): {
  message: string;
  notice?: EngineNoticeKind;
} {
  if (isTurnRunningRejection(e))
    return { message: SEND_BUSY_MESSAGE, notice: "send_busy" };
  if (computeBusyRefusal(e))
    return { message: COMPUTE_BUSY_MESSAGE, notice: "compute_busy" };
  return { message: turnErrorMessage(e) };
}
