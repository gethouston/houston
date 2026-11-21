import { EngineError } from "./client";
import { startIdleWatchdog } from "./idle-watchdog";
import {
  type ConversationEventSource,
  DEFAULT_BACKOFF_INITIAL_MS,
  DEFAULT_BACKOFF_MAX_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  FATAL_RESUME_STATUSES,
  FatalResumeError,
  type ResumableStreamOptions,
} from "./resume-contract";

export async function streamEventsResumable(
  source: ConversationEventSource,
  id: string,
  opts: ResumableStreamOptions,
): Promise<void> {
  const idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const initialMs = opts.backoff?.initialMs ?? DEFAULT_BACKOFF_INITIAL_MS;
  const maxMs = opts.backoff?.maxMs ?? DEFAULT_BACKOFF_MAX_MS;
  const jitter = opts.backoff?.jitter ?? ((capMs) => Math.random() * capMs);

  let after = opts.after;
  let legacy = false;
  let capMs = initialMs;
  let consecutiveFailures = 0;

  while (!opts.signal.aborted) {
    const attempt = new AbortController();
    const abortAttempt = () => attempt.abort();
    opts.signal.addEventListener("abort", abortAttempt, { once: true });
    const watchdog = startIdleWatchdog({
      idleTimeoutMs,
      now: Date.now,
      onStall: abortAttempt,
    });
    let delivered = false;
    let handlerError: unknown;
    let failure: unknown;

    try {
      await source.streamEvents(id, {
        signal: attempt.signal,
        after: legacy ? undefined : after,
        onActivity: () => watchdog.touch(),
        onEvent: (frame) => {
          delivered = true;
          consecutiveFailures = 0;
          capMs = initialMs;
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
      failure = err;
    } finally {
      watchdog.stop();
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
      if (opts.signal.aborted) return;
    }
    const waitMs = jitter(capMs);
    capMs = Math.min(capMs * 2, maxMs);
    await sleep(waitMs, opts.signal);
  }
}

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
