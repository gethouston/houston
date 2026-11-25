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

export const SEND_WAKE_RETRY_DELAYS_MS: readonly number[] = [
  2_000, 3_000, 5_000, 5_000, 10_000, 10_000, 15_000, 15_000, 30_000, 30_000,
  30_000, 30_000,
];

export const SEND_TURN_RUNNING_RETRY_DELAYS_MS: readonly number[] = [
  1_000, 2_000, 4_000, 8_000, 15_000,
];
export const SEND_TURN_RUNNING_HOLD_MS = 15 * 60_000;
export const SEND_TURN_RUNNING_MAX_HOLD_MS = (4 * 60 + 5) * 60_000;

/**
 * Consecutive frameless connection attempts before a subscription gives up:
 * a turn settles as an error (never an eternal spinner); an observer disposes silently. Attempts that fail FAST (dead
 * local sidecar refusing the connection) spend it in ~45s of backoff; an
 * attempt that HANGS costs a full 45s idle watchdog, so the budget must
 * outlast the cloud gateway's cold-wake hold — ensureAwake keeps every
 * request open for up to 300s while the agent pod starts, and a budget of 6
 * gives up at ~283s, moments before a slow wake would deliver.
 * 8 hung attempts ≈ 6+ minutes, past the gateway's own verdict.
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

export const SEND_VERDICT_MS = 15_000;
export const PRESETTLED_POLL_MS = 1_500;
export const PRESETTLED_GONE_MS = 120_000;
export const PRESETTLED_GONE_MAX_POLL_MS = 15_000;
export const SEND_LOST_MESSAGE =
  "Your message didn't reach the agent. Check your connection and send it again.";
