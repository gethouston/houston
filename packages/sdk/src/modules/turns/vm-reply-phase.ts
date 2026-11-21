import type { BoardPersistOptions, BoardStatus } from "./feed-output";

export interface ReplyPhaseVM {
  replyComplete?: true;
}

export interface ReplyPhaseState {
  replyComplete: boolean;
}

export function foldReplyPhase(
  s: ReplyPhaseState,
  status: BoardStatus,
  opts: BoardPersistOptions | undefined,
): boolean {
  s.replyComplete = opts?.provisional === true && status === "needs_you";
  return opts?.provisional === true;
}

export function replyPhaseField(
  s: ReplyPhaseState & { sessionStatus: string },
): ReplyPhaseVM {
  return s.replyComplete && s.sessionStatus === "running"
    ? { replyComplete: true }
    : {};
}
