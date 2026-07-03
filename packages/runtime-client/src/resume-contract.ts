import type { EngineError, EventStreamOptions } from "./client";
import type { WireFrame } from "./types";

/**
 * The resumable subscription's caller-facing contract: options, retry
 * reporting, and the fatal stop. The loop itself lives in `resume.ts`.
 */

/** Any client that can open one conversation-events connection attempt. */
export interface ConversationEventSource {
  streamEvents(id: string, opts: EventStreamOptions): Promise<void>;
}

export interface ResumableBackoff {
  /** First reconnect delay cap. Default 500ms. */
  initialMs?: number;
  /** Delay-cap ceiling. Default 10s. */
  maxMs?: number;
  /**
   * Full-jitter draw: the actual wait for a given cap, in [0, capMs].
   * Default `Math.random() * capMs`. Injectable for deterministic tests.
   */
  jitter?: (capMs: number) => number;
}

/** One frameless connection attempt, reported through `onRetry`. */
export interface ResumeRetryInfo {
  /** Attempts in a row that delivered zero frames (any frame resets it). */
  consecutiveFailures: number;
  /** What ended the attempt: the thrown error, or undefined on a clean close. */
  error: unknown;
}

/** HTTP statuses a reconnect can never fix: auth refusals + gone conversations. */
export const FATAL_RESUME_STATUSES: ReadonlySet<number> = new Set([
  401, 403, 404, 410,
]);

/**
 * The subscription hit a response that retrying cannot fix (401/403/404/410)
 * and stopped. `cause` is the refusing request's EngineError.
 */
export class FatalResumeError extends Error {
  readonly status: number;
  constructor(override readonly cause: EngineError) {
    super(`conversation stream refused (${cause.status}); not retrying`);
    this.name = "FatalResumeError";
    this.status = cause.status;
  }
}

export interface ResumableStreamOptions {
  /** Abort to stop the subscription. */
  signal: AbortSignal;
  /** Every frame, in order: replayed catch-up frames and live ones alike. */
  onEvent: (frame: WireFrame) => void;
  /**
   * Initial resume cursor: the FIRST connect already asks for `seq > after`
   * instead of the fresh-connect `sync` — for handing a conversation over
   * from another subscription (e.g. observer → turn) without a frame gap.
   */
  after?: number;
  /**
   * A connection attempt ended without delivering a single frame (rejected,
   * dropped, or closed clean) and the loop is about to back off and retry.
   * The caller can bail by aborting `signal` (e.g. after a failure budget).
   */
  onRetry?: (info: ResumeRetryInfo) => void;
  /**
   * Force-close + reconnect (with cursor) when the connection has been silent
   * this long. Servers heartbeat every 15s, so silence means a wedged
   * connection, not an idle turn. Default 45s.
   */
  idleTimeoutMs?: number;
  backoff?: ResumableBackoff;
}

export const DEFAULT_IDLE_TIMEOUT_MS = 45_000;
export const DEFAULT_BACKOFF_INITIAL_MS = 500;
export const DEFAULT_BACKOFF_MAX_MS = 10_000;
