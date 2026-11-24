import { NAME_TAKEN } from "@houston/protocol/file-refusal";
import { AGENT_MOVED, AGENT_NOT_FOUND } from "@houston/wire-types";

const MOVE_REFUSAL_CODES = [
  "unsupported_move",
  "unmovable_volume",
  "needs_upgrade",
  NAME_TAKEN,
] as const;

export type MoveRefusalCode = (typeof MOVE_REFUSAL_CODES)[number];

/**
 * A failed move as a surface explains it: one of the C8 refusals, the client's
 * own `timeout` (a poll that outlived its budget), or `unknown`.
 */
export type MoveErrorKind = MoveRefusalCode | "timeout" | "unknown";

/** Whether a move answered with one of the C8 refusal codes. */
export function isMoveRefusalCode(
  code: string | null | undefined,
): code is MoveRefusalCode {
  return (
    MOVE_REFUSAL_CODES as readonly (string | null | undefined)[]
  ).includes(code);
}

/** Map a move's error code (rejection or poll `error`) to its kind. */
export function classifyMoveError(
  code: string | null | undefined,
): MoveErrorKind {
  return isMoveRefusalCode(code) ? code : "unknown";
}

/**
 * Whether trying the same move again can succeed. A storage the gateway cannot
 * move stays unmovable, and a taken name stays taken until the person renames
 * the agent; every other failure may clear on its own.
 */
export function canRetryMoveError(kind: MoveErrorKind): boolean {
  return kind !== "unmovable_volume" && kind !== NAME_TAKEN;
}

/**
 * Whether the gateway refused the move before anything started (C8
 * `name_taken`). No move lock is held, so a client's record of the move to
 * resume is void: re-sending it can only be refused again until the person
 * acts. Every other refusal may leave a lock that only a finished move frees.
 */
export function isMoveRefusedBeforeStart(
  code: string | null | undefined,
): code is typeof NAME_TAKEN {
  return code === NAME_TAKEN;
}

/**
 * Whether the gateway answered a move with `agent_moved`: the agent already
 * lives in the requested team, so the move is done. A client clears its
 * record of the move and refreshes its agents instead of re-sending it. An
 * older gateway answers the same state with an uncoded 404, which stays an
 * ordinary rejection.
 */
export function isMoveAlreadyDone(
  code: string | null | undefined,
): code is typeof AGENT_MOVED {
  return code === AGENT_MOVED;
}

/**
 * What a client does with the answer to a move it re-sends from its record:
 * - `done` (`agent_moved`): the agent already lives in the team. Clear the
 *   record and refresh the agents.
 * - `gone` (`agent_not_found`): the agent is in neither space and no move
 *   holds it, so nothing is left to move or resume. Clear the record and
 *   refresh the agents.
 * - `refused` ({@link isMoveRefusedBeforeStart}): nothing started. Clear.
 * - `inProgress` (`move_in_progress`): another driver's live move owns the
 *   agent. Keep the record; that driver settles it.
 * - `rejected`: anything else, an older gateway's uncoded 404 included. Keep
 *   the record: a held lock is only freed by a finished move.
 */
export type MoveRePostVerdict =
  | { kind: "done" }
  | { kind: "gone" }
  | { kind: "refused"; code: typeof NAME_TAKEN }
  | { kind: "inProgress" }
  | { kind: "rejected"; code: string | null | undefined };

/** Classify the rejection code of a re-sent move ({@link MoveRePostVerdict}). */
export function classifyMoveRePost(
  code: string | null | undefined,
): MoveRePostVerdict {
  if (isMoveAlreadyDone(code)) return { kind: "done" };
  if (code === AGENT_NOT_FOUND) return { kind: "gone" };
  if (isMoveRefusedBeforeStart(code)) return { kind: "refused", code };
  if (code === "move_in_progress") return { kind: "inProgress" };
  return { kind: "rejected", code };
}
