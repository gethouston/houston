import { type ActivityStamp, isOfferToolName } from "@houston/protocol";
import type { WireFrame } from "@houston/runtime-client";
import type { TurnCardWrites } from "./board-writes";
import type { TerminalBoardStatus } from "./feed-output";
import type { TurnState } from "./turn-state";

export interface TurnReplyState {
  replyComplete: boolean;
  board?: TurnCardWrites;
}

export function noteReplyPhase(s: TurnState, ev: WireFrame): void {
  if (s.settled) return;
  if (ev.type === "reply_complete") setReplyPhase(s, true);
  else if (s.replyComplete && carriesOn(ev)) setReplyPhase(s, false);
}

function carriesOn(ev: WireFrame): boolean {
  switch (ev.type) {
    case "text":
    case "thinking":
      return /\S/.test(ev.data);
    case "tool_start":
      return !isOfferToolName(ev.data.name);
    default:
      return false;
  }
}

export function setReplyPhase(s: TurnState, complete: boolean): void {
  if (s.replyComplete === complete) return;
  s.replyComplete = complete;
  s.board?.replyPhase(complete);
}

export function settleCard(
  s: TurnState,
  terminal: TerminalBoardStatus,
  stamp?: ActivityStamp,
): void {
  s.terminal = terminal;
  s.board?.settle(terminal, s.pendingInteraction, stamp);
}
