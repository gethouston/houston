/**
 * The turn machinery's OUTPUT port — the seam the extraction inverts.
 *
 * The turn/feed machinery (sink, stream runners, settles) folds ONE
 * conversation's wire frames into three kinds of push: a chat FeedItem, a
 * SessionStatus, and a persisted board-card status. Historically those pushes
 * went straight onto the desktop's in-process event bus. That coupling is now
 * inverted — the machinery emits ONLY through {@link FeedOutput}, and the host
 * supplies the implementation: the SDK's built-in conversation-VM fold
 * (`vm-output.ts`), the web adapter's bus bridge, or several at once
 * ({@link MultiplexFeedOutput}). One machinery, any number of outputs.
 *
 * These three methods mirror the original bus seams exactly; the union types
 * are the same ones the desktop UI reacts to, carried along unchanged.
 */

import type { ActivityStamp } from "@houston/protocol";
import type { PendingInteraction } from "@houston/runtime-client";
import type { FirstResponse } from "./first-response";
import type { SendWaitReason } from "./send-busy";
import type { SessionStatusDetail } from "./turn-error-class";

export type { PendingInteraction } from "@houston/runtime-client";
export { MultiplexFeedOutput } from "./feed-output-multiplex";

/**
 * The session statuses a streamed turn produces. The desktop reacts to exactly
 * these: `running` drives the spinner/loading flag, `completed` the
 * notification + settle, `error` the failure surface. `starting` exists in the
 * legacy dialect; this machinery never emits it.
 */
export type SessionStatusValue = "starting" | "running" | "completed" | "error";

/**
 * Terminal board-card status, persisted once the turn settles. Two values, and
 * `done` is deliberately NOT one of them: the engine never closes a mission —
 * only the user moves a card to done. A clean turn lands `needs_you` (carrying
 * its pending interaction, blocking or offer-only, when it ended on one), as
 * does a handled non-success (user Stop, logged-out provider — those never
 * carry an interaction); a real failure is `error`.
 */
export type TerminalBoardStatus = "needs_you" | "error";

/** Board-card statuses a streamed turn writes: running in flight, then terminal. */
export type BoardStatus = "running" | TerminalBoardStatus;

/**
 * How a board persist relates to the turn's settle. `provisional`: the turn's
 * reply finished streaming (`reply_complete`) and only its wrap-up remains, so
 * the card is handed back early (`needs_you`) — or taken back (`running`)
 * when the turn turned out to carry on. One a later write already overtook is
 * never sent (board-writes.ts). A board writer writes it like any other; the
 * conversation VM does NOT fold it into `boardStatus` (that is the "turn
 * settled" signal), only into `ConversationVM.replyComplete`.
 */
export interface BoardPersistOptions {
  provisional?: boolean;
  /** Only live message writes stamp the card; reconciliation leaves it alone. */
  stamp?: ActivityStamp;
}

/**
 * Everything the turn machinery emits for one conversation. An implementation
 * decides where the pushes land (a reactive VM, a UI bus, ...). `pushFeedItem`
 * and `sessionStatus` are fire-and-forget; `persistBoardStatus` is awaited so
 * the runner can settle the board card before the turn returns.
 */
export interface FeedOutput {
  /** One chat FeedItem for this conversation (streaming text, tool call, ...). */
  pushFeedItem(agentPath: string, sessionKey: string, item: unknown): void;
  /**
   * The conversation's session status (spinner / settle / failure). `detail`
   * is additive: the turn's origin, and on a failure WHY it failed
   * ({@link SessionStatusDetail}); `error` stays the product-voice copy.
   */
  sessionStatus(
    agentPath: string,
    sessionKey: string,
    status: SessionStatusValue,
    error?: string,
    detail?: SessionStatusDetail,
  ): void;
  /**
   * Persist the board-card status through the host's (cloud-aware) seam.
   * `pendingInteraction` rides the terminal persist: the interaction a clean
   * turn ended on (what the `needs_you` card renders), or `null` to clear it
   * (turn start, and every settle that carries no interaction). Omitted is
   * treated as `null`. `opts` marks an early write ({@link BoardPersistOptions}).
   */
  persistBoardStatus(
    agentPath: string,
    sessionKey: string,
    status: BoardStatus,
    pendingInteraction?: PendingInteraction | null,
    opts?: BoardPersistOptions,
  ): Promise<void>;
  /**
   * The server confirmed this conversation is IDLE (an observer attached and
   * its sync reported no turn in flight). Lets an output reconcile state that
   * says otherwise — a `running` VM whose stream was torn down without a settle
   * (client teardown keeps live state by design) would otherwise stay "running"
   * forever, wedging everything keyed on it (the send queue, the spinner).
   * Optional and additive: outputs with no such state simply omit it.
   */
  confirmIdle?(agentPath: string, sessionKey: string): void;
  /**
   * The engine echoed our send: the optimistic user bubble's turn now has a
   * wire id. Lets an output stamp `turnId` onto that bubble so turn-anchored
   * affordances (the edit-and-resend rewind, PRODUCT-1217) work on a live
   * conversation without waiting for a history reload. Optional and additive.
   */
  stampUserTurn?(agentPath: string, sessionKey: string, turnId: string): void;
  /**
   * The first response of a turn THIS client sent (see `first-response.ts`):
   * its first visible text, or how it ended without one. Exactly once per sent
   * turn, never for an observed one, and nothing for a stream torn down by the
   * client. Optional and additive.
   */
  firstResponse?(
    agentPath: string,
    sessionKey: string,
    response: FirstResponse,
  ): void;
  /**
   * A message this client sent is still waiting to start, and why (only busy
   * compute today, `send-busy.ts`), or `null` once it was accepted or failed.
   * Optional and additive.
   */
  sendWaiting?(
    agentPath: string,
    sessionKey: string,
    reason: SendWaitReason | null,
  ): void;
}
