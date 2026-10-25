import type { ResumableBackoff } from "@houston/runtime-client";

/** Reconnect knobs, injectable so tests don't sit through real backoff. */
export interface StreamTuning {
  idleTimeoutMs?: number;
  backoff?: ResumableBackoff;
  /**
   * Grace before an AMBIGUOUS send failure (transport error — the engine may
   * or may not have received the POST) settles the turn as an error. Within
   * the window the live stream can prove the send landed (nonce echo /
   * running sync) and the turn proceeds as if the send had succeeded.
   */
  sendVerdictMs?: number;
  /**
   * Grace before the PRE-SETTLED poll fires (see {@link PRESETTLED_POLL_MS}).
   * A turn that completes BEFORE our subscription's first sync leaves us with a
   * fresh idle sync and no frames ever replayed; after this grace with still no
   * stream evidence, the sink reloads history and settles ONLY on conclusive
   * proof the turn finished. Tests shrink it to fire quickly.
   */
  presettledPollMs?: number;
  /**
   * The waits between re-sends of a message the engine refused as "not here,
   * not now" (see {@link SEND_WAKE_RETRY_DELAYS_MS}). Tests shrink them.
   */
  sendWakeRetryDelaysMs?: readonly number[];
  /**
   * The fallback waits between re-sends of a message held behind a running
   * turn (see {@link SEND_TURN_RUNNING_RETRY_DELAYS_MS}); the last repeats.
   */
  sendTurnRunningRetryDelaysMs?: readonly number[];
  /** How long a held send waits in total (see {@link SEND_TURN_RUNNING_HOLD_MS}). */
  sendTurnRunningHoldMs?: number;
  /** How long a busy send keeps re-sending (`send-busy.ts` SEND_BUSY_WAIT_MS). */
  sendBusyWaitMs?: number;
  /** How long a busy send waits before the VM says so (SEND_BUSY_NOTICE_MS). */
  sendBusyNoticeMs?: number;
  /**
   * How long a sent turn may go without a first response before it reports
   * `timeout` (see `FIRST_RESPONSE_TIMEOUT_MS`). Tests shrink it.
   */
  firstResponseTimeoutMs?: number;
}

/**
 * A send that meets a pod mid-restart (an engine roll draining the old pod,
 * the replacement still booting) is refused with a waking 503/502. The
 * message is not lost and nothing is wrong: re-send the SAME message (same
 * nonce, so a late acceptance can never double it) on this ladder while the
 * user's bubble stays pending. About three minutes end to end — longer than
 * a cold boot, shorter than the drain of a long turn on a shared agent, after
 * which the refusal surfaces like any other rejected send.
 */
export const SEND_WAKE_RETRY_DELAYS_MS: readonly number[] = [
  2_000, 3_000, 5_000, 5_000, 10_000, 10_000, 15_000, 15_000, 30_000, 30_000,
  30_000, 30_000,
];

/**
 * A send that meets `409 turn running` is HELD, not failed: another turn still
 * owns the conversation. On the cloud pool that includes the previous reply's
 * own tail, since its sandbox titles the mission and writes the conversation
 * back before it posts the terminal frame, and the claim frees a beat after
 * that (4.8 s on staging, 2026-10-02). The re-send rides the stream's evidence
 * that the turn ended; these are the fallback waits when no evidence comes
 * (a teammate's turn this stream doesn't follow, the claim lag after a
 * terminal frame). The last one repeats.
 */
export const SEND_TURN_RUNNING_RETRY_DELAYS_MS: readonly number[] = [
  1_000, 2_000, 4_000, 8_000, 15_000,
];
/**
 * Base hold for a silent running-turn refusal. Live progress may extend it,
 * bounded by the four-hour ceiling plus five minutes for claim release.
 */
export const SEND_TURN_RUNNING_HOLD_MS = 15 * 60_000;
export const SEND_TURN_RUNNING_MAX_HOLD_MS = (4 * 60 + 5) * 60_000;

/**
 * Consecutive frameless connection attempts before a subscription gives up:
 * a turn settles as an error (the old dead-server UX, not an eternal
 * spinner); an observer disposes silently. Attempts that fail FAST (dead
 * local sidecar refusing the connection) spend it in ~45s of backoff; an
 * attempt that HANGS costs a full 45s idle watchdog, so the budget must
 * outlast the cloud gateway's cold-wake hold — ensureAwake keeps every
 * request open for up to 300s while the agent pod starts, and a budget of 6
 * used to give up at ~283s, moments before a slow wake would have delivered
 * (HOU-705). 8 hung attempts ≈ 6+ minutes, past the gateway's own verdict.
 */
export const STREAM_FAILURE_BUDGET = 8;
/** Budget-exhaustion copy when no attempt surfaced a concrete error. */
export const STREAM_LOST_MESSAGE = "Lost the connection to the engine.";
/**
 * Copy for a concurrent double-send: a second turn fired at the same
 * conversation while the first send is still in flight. Product voice (no
 * status codes) — the live rendering is left untouched, so the observer/first
 * turn keeps showing progress and this only explains the ignored duplicate.
 */
export const SEND_IN_FLIGHT_MESSAGE = "A message is already being sent.";

/**
 * How long an ambiguously-failed send (see {@link StreamTuning.sendVerdictMs})
 * waits for the stream to prove the turn started before settling as an error.
 * Long enough for the resumable stream to ride out the same network blip that
 * broke the send (a few backoff attempts), short enough that a genuinely lost
 * send doesn't leave the user staring at a spinner.
 */
export const SEND_VERDICT_MS = 15_000;
/**
 * How long the sink waits, after a FRESH idle sync in turn mode with the send
 * accepted, before it suspects the turn completed BEFORE the subscription's
 * first sync (the fake host's ~45ms canned reply, or a real instant error /
 * cancel) — a window in which the user echo, frames and terminal were all
 * emitted before we attached and are never replayed, so the stream carries no
 * evidence and the card would hang on "running" forever (0407aaa0). On fire the
 * sink reloads history and settles ONLY on conclusive proof the turn finished;
 * inconclusive (a healthy slow turn whose reply hasn't persisted) re-arms the
 * poll, and any stream evidence cancels it. Long enough that a turn that simply
 * hasn't started yet isn't polled needlessly, short enough that a genuinely
 * pre-settled turn leaves the spinner quickly.
 */
export const PRESETTLED_POLL_MS = 1_500;
/**
 * How long the pre-settled poll keeps reading "conversation not found" (404)
 * after an accepted send before it calls the turn lost (H-003). A backstop
 * only: the kept setup-error frame (`pre-accept-turn.ts`) is the fix, and
 * this fires only when that frame never reached us at all. Conservative on
 * purpose: a healthy turn's conversation can stay missing for a while, since
 * a DB-backed or standing path writes it with the user message right after
 * the 202, but a file-backed cloud transcript may exist only once the turn's
 * end-of-turn sync lands, and the turnlog can lag. Any stream frame from the
 * turn stops the clock.
 */
export const PRESETTLED_GONE_MS = 120_000;
/**
 * While history answers 404, the poll backs off from `PRESETTLED_POLL_MS`,
 * doubling up to this, instead of reading every 1.5 s.
 */
export const PRESETTLED_GONE_MAX_POLL_MS = 15_000;
/**
 * Copy for a send that provably never landed: the send fetch failed at the
 * transport level AND no evidence of the turn arrived within the verdict
 * window. Product voice (no status codes, no `TypeError: Load failed`), and
 * actionable — resending is safe precisely because the turn never started.
 */
export const SEND_LOST_MESSAGE =
  "Your message didn't reach the agent. Check your connection and send it again.";
