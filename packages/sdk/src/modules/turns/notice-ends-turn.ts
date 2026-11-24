import type { EngineNoticeKind } from "./turn-errors";

/**
 * Whether a system line's notice ends the turn it was written for. A restart
 * notice does not (the turn resumes); every other line does: a held send
 * refused for good, a turn that could not start, or no notice at all. A
 * subpath of its own (`@houston/sdk/notice-ends-turn`) so a surface's pure
 * helpers read it without the turn machinery.
 */
export function noticeEndsTurn(notice: EngineNoticeKind | undefined): boolean {
  return notice !== "engine_restart" && notice !== "engine_resumed";
}
