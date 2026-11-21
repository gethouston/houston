import type { EngineNoticeKind } from "./turn-errors";

export function noticeEndsTurn(notice: EngineNoticeKind | undefined): boolean {
  return notice !== "engine_restart" && notice !== "engine_resumed";
}
