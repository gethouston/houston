import { readEventStream } from "./sse-read";

/**
 * The workspace-global reactivity subscription: a long-lived SSE read of the
 * host's `GET /v1/events`, kept alive across drops with a fixed reconnect
 * delay. THE one client-side implementation of that loop — both the SDK's
 * agents module and the web control-plane adapter consume it, each keeping its
 * own auth scheme, payload translation, and reconnect hooks.
 *
 * fetch + `readEventStream` (NOT `EventSource`): a cross-origin `EventSource`
 * silently never connects inside the Tauri desktop webview, so the desktop
 * would get zero reactivity. fetch streaming works in both webview and browser.
 *
 * Unlike the per-conversation `streamEventsResumable`, this feed has no seq
 * cursor and no replay: a drop just reconnects and the caller catches up its
 * own way (the SDK refetches on {@link GlobalEventsOptions.onConnect}). One
 * garbled frame must not tear the feed down, so the read runs in tolerant mode.
 */

/** Fixed short reconnect delay, mirroring both consumers' historical behavior. */
const DEFAULT_RECONNECT_DELAY_MS = 1500;

export interface GlobalEventsOptions {
  /**
   * Build the request URL for each (re)connect. A function, not a string, so
   * the adapter can re-embed a fresh `?token=` per attempt and any consumer
   * that rotates auth in the query is always current.
   */
  url: () => string;
  /**
   * The transport. The SDK injects an auth-fetch that carries the bearer in a
   * header; the adapter passes the global `fetch` (auth rides `url()`'s query).
   */
  fetch: typeof fetch;
  /** Abort to stop the subscription for good. */
  signal: AbortSignal;
  /** Each parsed `data:` frame's JSON payload, in order. Comments never reach here. */
  onEvent: (data: unknown) => void;
  /**
   * Fired after every successful (re)connect, before any frame is read — the
   * refetch seam for a consumer that catches up missed state on reconnect.
   */
  onConnect?: () => void;
  /**
   * A `401` response. When provided, it is called and the connection is NOT
   * read; the loop then backs off and retries (so a refreshed token reconnects
   * cleanly). When ABSENT, a `401` is just another non-ok status: it drops to
   * {@link onError} and reconnects.
   */
  onUnauthorized?: () => void;
  /**
   * A dropped or refused attempt (transport error, non-ok status). Optional —
   * a consumer that reconnects silently omits it.
   */
  onError?: (err: unknown) => void;
  /** Reconnect delay in ms. Default 1500. */
  delayMs?: number;
  /**
   * Schedule the reconnect wait, resolving early if `signal` aborts. Injectable
   * so a host with its own clock port (the SDK) drives it deterministically;
   * defaults to a `setTimeout`-backed wait.
   */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/**
 * Run the global-events loop until `signal` aborts: connect → read → wait →
 * reconnect. Malformed data frames are swallowed (tolerant read). Resolves
 * only when the caller aborts.
 */
export async function streamGlobalEvents(
  opts: GlobalEventsOptions,
): Promise<void> {
  const { signal } = opts;
  const delayMs = opts.delayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  const wait = opts.sleep ?? defaultSleep;
  while (!signal.aborted) {
    try {
      const res = await opts.fetch(opts.url(), {
        headers: { Accept: "text/event-stream" },
        signal,
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
          undefined,
          { onParseError: () => {} }, // a garbled frame is dropped, not fatal
        );
      }
    } catch (err) {
      if (signal.aborted) return; // our own teardown — expected
      opts.onError?.(err);
    }
    if (signal.aborted) return;
    await wait(delayMs, signal);
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
