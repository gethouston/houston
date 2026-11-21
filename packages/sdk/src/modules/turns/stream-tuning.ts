import type { ResumableBackoff } from "@houston/runtime-client";

export interface StreamTuning {
  idleTimeoutMs?: number;
  backoff?: ResumableBackoff;
  sendVerdictMs?: number;
  presettledPollMs?: number;
  sendWakeRetryDelaysMs?: readonly number[];
  sendTurnRunningRetryDelaysMs?: readonly number[];
  sendTurnRunningHoldMs?: number;
  sendBusyWaitMs?: number;
  sendBusyNoticeMs?: number;
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

export const STREAM_FAILURE_BUDGET = 8;
export const STREAM_LOST_MESSAGE = "Lost the connection to the engine.";
export const SEND_IN_FLIGHT_MESSAGE = "A message is already being sent.";

export const SEND_VERDICT_MS = 15_000;
export const PRESETTLED_POLL_MS = 1_500;
export const PRESETTLED_GONE_MS = 120_000;
export const PRESETTLED_GONE_MAX_POLL_MS = 15_000;
export const SEND_LOST_MESSAGE =
  "Your message didn't reach the agent. Check your connection and send it again.";
