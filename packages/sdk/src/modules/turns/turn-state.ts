import type { PendingInteraction, TokenUsage } from "@houston/runtime-client";
import type {
  FeedOutput,
  SessionStatusValue,
  TerminalBoardStatus,
} from "./feed-output";
import type { FirstResponseClock } from "./first-response";
import type { TurnReplyState } from "./reply-phase";
import { SEND_LOST_MESSAGE, STREAM_LOST_MESSAGE } from "./stream-tuning";
import type { SessionStatusOrigin, TurnErrorClass } from "./turn-error-class";
import {
  type EngineNoticeKind,
  isStoppedByUser,
  TURN_DIED_MESSAGE,
  TURN_FAILED_MESSAGE,
} from "./turn-errors";

/**
 * One turn's state (owned by TurnSink) and how it emits its session status.
 * The settles that drive it live in turn-settle.ts / settle-from-history.ts.
 */

/** One streamed turn's accumulation + settle state (owned by TurnSink). */
export interface TurnState extends TurnReplyState {
  agentPath: string;
  sessionKey: string;
  /** Where every FeedItem / SessionStatus for this turn is emitted. */
  output: FeedOutput;
  /**
   * The provider this chat INTENDED to run on (the composer's pick, in the
   * caller's id dialect). The runtime can't name one in its not-connected
   * refusal — nothing is connected — so the reconnect card is labeled with
   * this instead. Null when the caller had no pick (observer mode, no
   * per-turn switch): the surface falls back to the chat's own provider.
   */
  provider: string | null;
  /** The turn's prompt — carried on the not-connected card so "Send again"
   *  can resend the exact text the runtime refused (it was never delivered). */
  prompt: string | null;
  /**
   * OUR turn's wire id, once known (nonce-matched echo / attaching sync — the
   * sink owns adoption; see `turn-identity.ts`). Every {@link push} stamps it
   * on the item so the VM fold can dedupe re-delivered turn content by
   * identity (HOU-1214). Undefined until adopted (and forever on legacy
   * servers that stamp no turn ids — those keep the append-only fold).
   */
  turnId: string | undefined;
  text: string;
  thinking: string;
  /**
   * How many of this turn's `tool_call` feed items were already pushed (live
   * frames + sync replay) — the dedup cursor a running `sync`'s tool replay
   * starts from, so a resync never doubles a tool row (HOU-717).
   */
  toolsSeen: number;
  /** Same cursor for `tool_result` pushes. */
  toolResultsSeen: number;
  usage: TokenUsage | null;
  settled: boolean;
  terminal: TerminalBoardStatus | null;
  /**
   * The interaction the turn ended on (ask_user / request_connection, or a pure
   * offer from suggest_actions / suggest_reusable), captured from the clean
   * `done` wire frame; `null` when the turn settled without one. It does NOT
   * decide the board status — a clean finish always settles `needs_you` (see
   * {@link finishOk}) — it rides the terminal board persist so the card can
   * render its composer-replacing question/connect card or its suggestion
   * bubbles. Handled non-success settles (user Stop, provider error) never set
   * it.
   */
  pendingInteraction: PendingInteraction | null;
  /**
   * Whether the send was ever confirmed to REACH the engine — the send returned
   * 202, our nonce echo came back, or the turn produced any frame / running
   * sync. The sink sets it; the settles read it. An error settle with
   * `delivered === false` means the message provably never landed (lost /
   * rejected / refused), so its optimistic bubble is failed rather than
   * confirmed. An AMBIGUOUS transport failure does NOT set it — only the
   * verdict window's independent evidence does.
   */
  delivered: boolean;
  /**
   * Turn mode only: the clock this turn's first response reports through (see
   * `first-response.ts`). Fed by {@link push} (the first visible text) and by
   * every settle below (how a turn with no text ended). Absent for an observer.
   */
  firstResponse?: FirstResponseClock;
  /** Whose turn this is: sent by this client, or observed (see `SessionStatusOrigin`). */
  origin: SessionStatusOrigin;
}

export function newTurnState(
  agentPath: string,
  sessionKey: string,
  output: FeedOutput,
  send?: {
    provider?: string;
    prompt?: string;
    firstResponse?: FirstResponseClock;
    board?: TurnReplyState["board"];
    /** The sink's mode; absent reads as a turn this client sent. */
    mode?: "turn" | "observer";
  },
): TurnState {
  return {
    agentPath,
    sessionKey,
    output,
    provider: send?.provider ?? null,
    prompt: send?.prompt ?? null,
    turnId: undefined,
    text: "",
    thinking: "",
    toolsSeen: 0,
    toolResultsSeen: 0,
    usage: null,
    settled: false,
    terminal: null,
    pendingInteraction: null,
    delivered: false,
    firstResponse: send?.firstResponse,
    replyComplete: false,
    board: send?.board,
    origin: send?.mode === "observer" ? "observed" : "sent",
  };
}

/**
 * Emit this turn's session status with its detail: the origin on every
 * status, the error class on a failure (`SessionStatusDetail`).
 */
export function emitStatus(
  s: TurnState,
  status: SessionStatusValue,
  error?: string,
  errorClass?: TurnErrorClass,
  stopReason?: "turn_time_limit" | "turn_time_limit_unsaved",
): void {
  s.output.sessionStatus(s.agentPath, s.sessionKey, status, error, {
    origin: s.origin,
    ...(errorClass ? { errorClass } : {}),
    ...(stopReason ? { stopReason } : {}),
  });
}

/**
 * The class each notice kind settles as; exhaustive, so a new notice kind is
 * a compile error until it is classed. `engine_resumed` never reaches
 * `finishErr` (its settle is `finishResumed`, a `completed` status).
 */
const NOTICE_CLASS: Record<EngineNoticeKind, TurnErrorClass | null> = {
  engine_restart: "engine_restart",
  engine_resumed: null,
  turn_time_limit: null,
  turn_time_limit_unsaved: null,
  send_busy: "send_busy",
  compute_busy: "compute_busy",
  // The H-003 setup notices and the lost-after-202 bound class as themselves
  // (`turn-error-class.ts` says why each is its own `failure` class).
  agent_too_large: "agent_too_large",
  agent_setup_failed: "agent_setup_failed",
  turn_unconfirmed: "turn_unconfirmed",
};

/**
 * The class of a `finishErr` settle, from what the settle was given: the
 * typed notice first, then the SDK's own message constants. Every one of
 * those strings is minted here (the lost-send, lost-stream, dead-turn and
 * no-verdict copy), so matching them by identity reads the settle's typed
 * input, not the chat copy. Whatever remains is the engine's own verdict (a
 * wire `error` frame, a refused send's body).
 */
export function turnErrorClass(
  msg: string,
  notice?: EngineNoticeKind,
): TurnErrorClass {
  if (isStoppedByUser(msg)) return "stopped";
  const byNotice = notice ? NOTICE_CLASS[notice] : null;
  if (byNotice) return byNotice;
  if (msg === TURN_DIED_MESSAGE) return "turn_died";
  if (msg === SEND_LOST_MESSAGE) return "send_lost";
  if (msg === STREAM_LOST_MESSAGE) return "stream_lost";
  if (msg === TURN_FAILED_MESSAGE) return "unexplained";
  return "engine_verdict";
}
