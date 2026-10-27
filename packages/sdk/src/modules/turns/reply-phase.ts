import { type ActivityStamp, isOfferToolName } from "@houston/protocol";
import type { WireFrame } from "@houston/runtime-client";
import type { TurnCardWrites } from "./board-writes";
import type { TerminalBoardStatus } from "./feed-output";
import type { TurnState } from "./turn-state";

/** The turn state's reply phase (`TurnState` extends it). */
export interface TurnReplyState {
  /**
   * Whether the turn's reply is complete and only its wrap-up remains
   * (`reply_complete`). Cleared again by later work.
   */
  replyComplete: boolean;
  /** The turn's ordered card writes (board-writes.ts): its reply phases,
   *  which the VM folds into `ConversationVM.replyComplete`, and its settle. */
  board?: TurnCardWrites;
}

/**
 * The reply phase of a running turn. `reply_complete` says the model's reply
 * finished streaming and only the wrap-up remains (the offers, durability,
 * the title, then `done`): the card is handed back to the user at once
 * instead of seconds later. The frame is a forecast, not a settle, so the
 * turn takes the card back if it turns out to carry on: more visible text or
 * thinking, or a tool that is not an offer (the offers ARE the wrap-up).
 * Once the turn settled nothing changes here; the settle persist owns the card.
 */
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

/**
 * Record the turn's terminal card status and queue its settle write NOW,
 * before the settle publishes its session status: that publish can start the
 * next turn synchronously (a send queued during the wrap-up flushes on it),
 * and the next turn's `running` write must queue behind this one
 * (board-writes.ts), never race it.
 */
export function settleCard(
  s: TurnState,
  terminal: TerminalBoardStatus,
  stamp?: ActivityStamp,
): void {
  s.terminal = terminal;
  s.board?.settle(terminal, s.pendingInteraction, stamp);
}
