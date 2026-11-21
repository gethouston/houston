import { EngineError } from "@houston/runtime-client";
import { COMPUTE_BUSY_MESSAGE, computeBusyRefusal } from "./send-busy";
import {
  type EngineNoticeKind,
  engineVerdictMessage,
  turnErrorMessage,
} from "./turn-errors";

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
