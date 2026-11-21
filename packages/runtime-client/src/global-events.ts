import {
  DEFAULT_GLOBAL_RECONNECT_MS,
  type GlobalEventsOptions,
  WAKE_SETTLE_MS,
  WAKE_STALE_MS,
} from "./global-events-contract";
import { startIdleWatchdog } from "./idle-watchdog";
import {
  DEFAULT_BACKOFF_MAX_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
} from "./resume-contract";
import { readEventStream } from "./sse-read";

export async function streamGlobalEvents(
  opts: GlobalEventsOptions,
): Promise<void> {
  const { signal } = opts;
  const initialMs = opts.delayMs ?? DEFAULT_GLOBAL_RECONNECT_MS;
  const maxMs = Math.max(initialMs, opts.maxDelayMs ?? DEFAULT_BACKOFF_MAX_MS);
  const jitter = opts.jitter ?? ((capMs) => Math.random() * capMs);
  const idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const wait = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;

  let capMs = initialMs;
  let pokeAttempt: (() => void) | undefined;
  let pokeWait: (() => void) | undefined;
  const offWake = opts.wake?.(() => {
    pokeAttempt?.();
    pokeWait?.();
  });

  try {
    while (!signal.aborted) {
      const attempt = new AbortController();
      const abortAttempt = () => attempt.abort();
      signal.addEventListener("abort", abortAttempt, { once: true });
      let stalled = false;
      let delivered = false;
      const giveUp = () => {
        stalled = true;
        attempt.abort();
      };
      const watchdog = startIdleWatchdog({
        idleTimeoutMs,
        now,
        onStall: giveUp,
      });
      let settle: ReturnType<typeof setTimeout> | undefined;
      const settleThenJudge = () => {
        clearTimeout(settle);
        const armedAt = now();
        settle = setTimeout(() => {
          if (now() - armedAt > 2 * WAKE_SETTLE_MS) settleThenJudge();
          else if (watchdog.silentMs() > WAKE_STALE_MS) giveUp();
        }, WAKE_SETTLE_MS);
      };
      pokeAttempt = settleThenJudge;

      try {
        const res = await opts.fetch(opts.url(), {
          headers: { Accept: "text/event-stream" },
          signal: attempt.signal,
        });
        if (res.status === 401 && opts.onUnauthorized) {
          opts.onUnauthorized();
        } else if (!res.ok || !res.body) {
          throw new Error(`/v1/events ${res.status}`);
        } else {
          opts.onConnect?.();
          await readEventStream(
            res.body,
            (frame) => opts.onEvent(frame as unknown),
            () => {
              watchdog.touch();
              delivered = true;
              capMs = initialMs;
            },
            { onParseError: () => {} },
          );
        }
      } catch (err) {
        if (signal.aborted) return;
        opts.onError?.(stalled ? stallError(idleTimeoutMs) : err);
      } finally {
        watchdog.stop();
        clearTimeout(settle);
        pokeAttempt = undefined;
        signal.removeEventListener("abort", abortAttempt);
      }

      if (signal.aborted) return;
      const waitMs = jitter(capMs);
      if (!delivered) capMs = Math.min(capMs * 2, maxMs);
      await waitForRetry(wait, waitMs, signal, (poke) => {
        pokeWait = poke;
      });
      pokeWait = undefined;
    }
  } finally {
    offWake?.();
  }
}

function stallError(idleTimeoutMs: number): Error {
  return new Error(`/v1/events stalled (no data for ${idleTimeoutMs}ms)`);
}

async function waitForRetry(
  sleep: (ms: number, signal: AbortSignal) => Promise<void>,
  ms: number,
  signal: AbortSignal,
  publish: (poke: () => void) => void,
): Promise<void> {
  const gate = new AbortController();
  const onAbort = () => gate.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  publish(onAbort);
  try {
    await sleep(ms, gate.signal);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
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
