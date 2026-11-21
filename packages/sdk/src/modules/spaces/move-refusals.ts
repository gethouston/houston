import { NAME_TAKEN } from "@houston/protocol/file-refusal";
import { AGENT_MOVED, AGENT_NOT_FOUND } from "@houston/wire-types";

const MOVE_REFUSAL_CODES = [
  "unsupported_move",
  "unmovable_volume",
  "needs_upgrade",
  NAME_TAKEN,
] as const;

export type MoveRefusalCode = (typeof MOVE_REFUSAL_CODES)[number];

export type MoveErrorKind = MoveRefusalCode | "timeout" | "unknown";

export function isMoveRefusalCode(
  code: string | null | undefined,
): code is MoveRefusalCode {
  return (
    MOVE_REFUSAL_CODES as readonly (string | null | undefined)[]
  ).includes(code);
}

export function classifyMoveError(
  code: string | null | undefined,
): MoveErrorKind {
  return isMoveRefusalCode(code) ? code : "unknown";
}

export function canRetryMoveError(kind: MoveErrorKind): boolean {
  return kind !== "unmovable_volume" && kind !== NAME_TAKEN;
}

export function isMoveRefusedBeforeStart(
  code: string | null | undefined,
): code is typeof NAME_TAKEN {
  return code === NAME_TAKEN;
}

export function isMoveAlreadyDone(
  code: string | null | undefined,
): code is typeof AGENT_MOVED {
  return code === AGENT_MOVED;
}

export type MoveRePostVerdict =
  | { kind: "done" }
  | { kind: "gone" }
  | { kind: "refused"; code: typeof NAME_TAKEN }
  | { kind: "inProgress" }
  | { kind: "rejected"; code: string | null | undefined };

export function classifyMoveRePost(
  code: string | null | undefined,
): MoveRePostVerdict {
  if (isMoveAlreadyDone(code)) return { kind: "done" };
  if (code === AGENT_NOT_FOUND) return { kind: "gone" };
  if (isMoveRefusedBeforeStart(code)) return { kind: "refused", code };
  if (code === "move_in_progress") return { kind: "inProgress" };
  return { kind: "rejected", code };
}
