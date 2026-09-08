/**
 * The global-events subscription's caller-facing contract: options and the
 * liveness tuning constants. The loop itself lives in `global-events.ts`
 * (same split as `resume-contract.ts` / `resume.ts`).
 */

/** First reconnect delay cap; doubles per failed attempt up to `maxDelayMs`. */
export const DEFAULT_GLOBAL_RECONNECT_MS = 1500;

/**
 * How long a connection may be silent before a {@link GlobalEventsOptions.wake}
 * treats it as half-open and forces a reconnect. Above the host's 15s heartbeat
 * (`packages/host/src/sse.ts`), so a wake on a healthy stream never tears it
 * down — only one the OS froze or the network moved out from under.
 */
export const WAKE_STALE_MS = 20_000;

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
   * A dropped, refused or stalled attempt. Optional — a consumer that
   * reconnects silently omits it. Self-limiting: the backoff spaces the
   * reports out, so a long outage logs on the retry schedule instead of twice
   * a second forever.
   */
  onError?: (err: unknown) => void;
  /** First backoff cap in ms. Default 1500. */
  delayMs?: number;
  /** Backoff cap ceiling in ms. Default 10s. */
  maxDelayMs?: number;
  /**
   * Full-jitter draw: the actual wait for a given cap, in [0, capMs].
   * Default `Math.random() * capMs`. Injectable for deterministic tests.
   */
  jitter?: (capMs: number) => number;
  /**
   * Force-close + reconnect when the connection has received no bytes for this
   * long. Default 45s (the conversation stream's ceiling).
   */
  idleTimeoutMs?: number;
  /**
   * Register external "try again now" signals — `online`, window visibility, an
   * OS resume. Called once with a `retryNow` callback and must return a
   * teardown. `retryNow` shortcuts a pending backoff wait, and force-reconnects
   * a connection that has been silent past {@link WAKE_STALE_MS}.
   */
  wake?: (retryNow: () => void) => () => void;
  /**
   * Schedule the reconnect wait, resolving early if `signal` aborts. Injectable
   * so a host with its own clock port (the SDK) drives it deterministically;
   * defaults to a `setTimeout`-backed wait.
   */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Monotonic-enough clock for the idle watchdog. Defaults to `Date.now`. */
  now?: () => number;
}
