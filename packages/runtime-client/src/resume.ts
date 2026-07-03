import { EngineError } from "./client";
import {
  type ConversationEventSource,
  DEFAULT_BACKOFF_INITIAL_MS,
  DEFAULT_BACKOFF_MAX_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  FATAL_RESUME_STATUSES,
  FatalResumeError,
  type ResumableStreamOptions,
} from "./resume-contract";

/**
 * The resumable conversation subscription — THE one client-side implementation
 * of the resume contract served by `packages/runtime/src/transport/events-route.ts`
 * and `packages/host/src/turn/events-route.ts`.
 *
 * It keeps one conversation's event stream alive until the caller aborts:
 * every drop (network error, server close, idle stall) reconnects with
 * `?after=<last seen seq>`, so the server replays exactly the missed frames —
 * no gap, no duplicate, no re-`sync`. It NEVER invents terminal frames: a dead
 * connection is a transport problem, not the end of the turn, and the caller
 * settles only on a real terminal frame (or its own cancel path).
 *
 * Two ways it ends besides the caller's abort:
 * - a FATAL response (401/403/404/410): retrying cannot change an auth
 *   refusal or a missing conversation, so the promise rejects with a
 *   `FatalResumeError` instead of hammering the server forever;
 * - a throwing `onEvent` handler (a caller bug), rethrown verbatim.
 * Transient failures keep retrying, but each frameless attempt is reported
 * through `onRetry` so the caller can enforce its own failure budget.
 *
 * Legacy servers (frames without an envelope `seq`) can't replay: the first
 * seq-less frame flips the subscription into legacy mode, where reconnects
 * carry no cursor and get the plain fresh-connect contract — the caller may
 * see a re-`sync` and has NO gap/dupe guarantee across a drop.
 */

/**
 * Subscribe to one conversation's event stream and keep it alive until
 * `opts.signal` aborts. Reconnects with exponential backoff (full jitter,
 * `initialMs` doubling to `maxMs`); the backoff resets to `initialMs` as soon
 * as a connection actually delivers a frame, so a healthy stream that drops
 * again reconnects fast. Resolves when the caller aborts; rejects on a fatal
 * response (`FatalResumeError`) or when an `onEvent` handler itself throws
 * (a caller bug must surface, never spin the reconnect loop).
 */
export async function streamEventsResumable(
  source: ConversationEventSource,
  id: string,
  opts: ResumableStreamOptions,
): Promise<void> {
  const idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const initialMs = opts.backoff?.initialMs ?? DEFAULT_BACKOFF_INITIAL_MS;
  const maxMs = opts.backoff?.maxMs ?? DEFAULT_BACKOFF_MAX_MS;
  const jitter = opts.backoff?.jitter ?? ((capMs) => Math.random() * capMs);
  // Idle detection is a cheap timestamp + one coarse sweep interval — never a
  // timer re-arm per delivered chunk. The sweep scales down with small (test)
  // timeouts so the watchdog stays meaningful there too.
  const sweepMs = Math.min(5_000, Math.max(20, Math.ceil(idleTimeoutMs / 4)));

  /** Last seen envelope seq — the reconnect cursor. */
  let after = opts.after;
  /** A seq-less frame arrived: legacy server, no cursor, no dedupe guarantee. */
  let legacy = false;
  let capMs = initialMs;
  let consecutiveFailures = 0;

  while (!opts.signal.aborted) {
    const attempt = new AbortController();
    const abortAttempt = () => attempt.abort();
    opts.signal.addEventListener("abort", abortAttempt, { once: true });
    // Covers a connect that never responds too: the timestamp starts now.
    let lastActivity = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > idleTimeoutMs) abortAttempt();
    }, sweepMs);
    let delivered = false;
    /** An exception from the caller's onEvent — rethrown, never retried. */
    let handlerError: unknown;
    /** What ended this attempt (undefined = the server closed clean). */
    let failure: unknown;

    try {
      await source.streamEvents(id, {
        signal: attempt.signal,
        after: legacy ? undefined : after,
        onActivity: () => {
          lastActivity = Date.now();
        },
        onEvent: (frame) => {
          delivered = true;
          consecutiveFailures = 0;
          capMs = initialMs; // a delivered frame proves the route works again
          if (typeof frame.seq === "number") after = frame.seq;
          else legacy = true;
          try {
            opts.onEvent(frame);
          } catch (err) {
            handlerError = err;
            attempt.abort();
          }
        },
      });
    } catch (err) {
      // Dropped connection / HTTP error / watchdog or caller abort: the loop
      // below decides between stopping and reconnecting.
      failure = err;
    } finally {
      clearInterval(watchdog);
      opts.signal.removeEventListener("abort", abortAttempt);
    }

    if (handlerError !== undefined) throw handlerError;
    if (opts.signal.aborted) return;
    if (
      failure instanceof EngineError &&
      FATAL_RESUME_STATUSES.has(failure.status)
    ) {
      throw new FatalResumeError(failure);
    }
    if (!delivered) {
      consecutiveFailures += 1;
      opts.onRetry?.({ consecutiveFailures, error: failure });
      if (opts.signal.aborted) return; // onRetry spent its failure budget
    }
    const waitMs = jitter(capMs);
    capMs = Math.min(capMs * 2, maxMs);
    await sleep(waitMs, opts.signal);
  }
}

/** Wait `ms`, resolving early (never rejecting) if `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}
