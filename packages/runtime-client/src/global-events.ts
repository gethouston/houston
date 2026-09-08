import {
  DEFAULT_GLOBAL_RECONNECT_MS,
  type GlobalEventsOptions,
  WAKE_STALE_MS,
} from "./global-events-contract";
import {
  DEFAULT_BACKOFF_MAX_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
} from "./resume-contract";
import { readEventStream } from "./sse-read";

/**
 * The workspace-global reactivity subscription: a long-lived SSE read of the
 * host's `GET /v1/events`, kept alive across drops for the whole life of the
 * page. THE one client-side implementation of that loop — both the SDK's
 * agents/activities modules and the web control-plane adapter consume it, each
 * keeping its own auth scheme, payload translation, and reconnect hooks.
 *
 * fetch + `readEventStream` (NOT `EventSource`): a cross-origin `EventSource`
 * silently never connects inside the Tauri desktop webview, so the desktop
 * would get zero reactivity. fetch streaming works in both webview and browser.
 *
 * Unlike the per-conversation `streamEventsResumable`, this feed has no seq
 * cursor and no replay: a drop just reconnects and the caller catches up its
 * own way ({@link GlobalEventsOptions.onConnect}). One garbled frame must not
 * tear the feed down, so the read runs in tolerant mode.
 *
 * Liveness policy — the same one `streamEventsResumable` runs, because the
 * failure modes are the same:
 * - It NEVER gives up. Only `signal` ends it, so a host restart window of any
 *   length is survivable and a dead stream is never a permanent state.
 * - Reconnects use full-jitter capped backoff, so an outage costs a bounded
 *   request rate (and a bounded number of log lines) instead of two attempts a
 *   second for as long as the app is open.
 * - An idle watchdog force-reconnects a silent connection. The host heartbeats
 *   every 15s (`packages/host/src/sse.ts`), so silence means a half-open socket
 *   (laptop slept, Wi-Fi switched, NAT dropped the flow) — which otherwise
 *   leaves `reader.read()` pending FOREVER: the tab holds a dead stream, logs
 *   nothing, and reactivity stops against a perfectly healthy host.
 * - {@link GlobalEventsOptions.wake} lets a surface push "the network is back"
 *   / "the window is visible again" in for instant recovery.
 */

/**
 * Run the global-events loop until `signal` aborts: connect → read → back off →
 * reconnect, forever. Malformed data frames are swallowed (tolerant read).
 * Resolves only when the caller aborts.
 */
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
  // Idle detection is a timestamp plus one coarse sweep — never a timer re-arm
  // per delivered chunk. The sweep scales down with small (test) timeouts so
  // the watchdog stays meaningful there too.
  const sweepMs = Math.min(5_000, Math.max(20, Math.ceil(idleTimeoutMs / 4)));

  let capMs = initialMs;
  /** Live while an attempt is open: a wake asks it to give up on a dead socket. */
  let pokeAttempt: (() => void) | undefined;
  /** Live while backing off: a wake cuts the remaining wait short. */
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
      // Starts now, so a connect that never answers is caught too.
      let lastActivity = now();
      let stalled = false;
      let delivered = false;
      const giveUp = () => {
        stalled = true;
        attempt.abort();
      };
      const watchdog = setInterval(() => {
        if (now() - lastActivity > idleTimeoutMs) giveUp();
      }, sweepMs);
      pokeAttempt = () => {
        if (now() - lastActivity > WAKE_STALE_MS) giveUp();
      };

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
              lastActivity = now();
              // Bytes prove the route works: a stream that drops again after
              // real traffic reconnects fast instead of inheriting the grown
              // backoff of the outage that came before it.
              delivered = true;
              capMs = initialMs;
            },
            { onParseError: () => {} }, // a garbled frame is dropped, not fatal
          );
        }
      } catch (err) {
        if (signal.aborted) return; // our own teardown — expected
        opts.onError?.(stalled ? stallError(idleTimeoutMs) : err);
      } finally {
        clearInterval(watchdog);
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

/** A stalled read fails with no thrown cause of its own — name it for the log. */
function stallError(idleTimeoutMs: number): Error {
  return new Error(`/v1/events stalled (no data for ${idleTimeoutMs}ms)`);
}

/**
 * Await the backoff, ending it early when the caller's `wake` fires. The
 * injected `sleep` only knows how to resolve on an AbortSignal, so a local
 * controller bridges the two: it aborts when the subscription aborts OR when
 * poked, and the poke is published for the loop's wake handler to call.
 */
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

/** Default reconnect wait: a `setTimeout` resolved early on abort. */
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
