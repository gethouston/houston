/**
 * Retry harness for the cloud-migration wizard's upload requests (HOU-719).
 *
 * The import POST is a long-lived, large-body request on an end-user network.
 * A dropped connection surfaces as WebKit's bare `TypeError: Load failed`; a
 * mid-body drop surfaces as the gateway's 400 "failed to read request body"
 * (its body buffer sees a truncated stream). Both are transient transport
 * failures, and every migration route is idempotent by design (skip-existing
 * imports, marker re-writes), so a blind re-send converges instead of
 * duplicating work. Each attempt also gets its own abort-based timeout so a
 * hung request can never wedge an agent's migration forever.
 *
 * Dependency-free so `node --test` exercises it directly
 * (see `app/tests/cloud-migration-retry.test.ts`).
 */

/** The slice of `Response` the retry decision needs (keeps tests fetch-free). */
export interface ResponseLike {
  ok: boolean;
  status: number;
}

export interface SendWithRetryOptions {
  /** Total attempts including the first (default 3). */
  attempts?: number;
  /** Waits before attempt 2, 3, … — the last entry repeats (default 1s, 4s). */
  backoffMs?: number[];
  /** Per-attempt budget before the request is aborted and retried. */
  timeoutMs?: number;
  /** Whether a settled response should be retried instead of returned. */
  shouldRetryResponse?: (res: ResponseLike) => boolean;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_RETRY_BACKOFF_MS = [1_000, 4_000];
/** Generous: covers a slow upload plus the gateway's ~290s pod-wake hold. */
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 300_000;

/**
 * Default response classification: server-side failures (5xx), the two
 * standard transient statuses (408, 429), and 400 — which on the migration
 * routes is the gateway's truncated-request-body signature, not a semantic
 * rejection (the import route's own 400, "not a readable zip", is the same
 * truncation seen one hop later). A deterministic 400 just spends the retry
 * budget and then surfaces with the server's own error detail.
 */
export function defaultShouldRetryResponse(res: ResponseLike): boolean {
  return res.status >= 500 || [400, 408, 429].includes(res.status);
}

/**
 * Run `send` until it yields a non-retryable response or the attempt budget is
 * spent. The final attempt's outcome is returned (or re-thrown) as-is so the
 * caller's error path still reports the real server detail.
 */
export async function sendWithRetry<R extends ResponseLike>(
  send: (signal: AbortSignal) => Promise<R>,
  opts: SendWithRetryOptions = {},
): Promise<R> {
  const attempts = Math.max(1, opts.attempts ?? DEFAULT_RETRY_ATTEMPTS);
  const backoff = opts.backoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const shouldRetry = opts.shouldRetryResponse ?? defaultShouldRetryResponse;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastError: unknown;
  let lastResponse: R | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await send(controller.signal);
      if (!shouldRetry(res)) return res;
      lastResponse = res;
      lastError = undefined;
    } catch (err) {
      lastResponse = undefined;
      // An abort here is OUR timeout (the wizard passes no outer signal) —
      // name it, or the row would show a bare "The operation was aborted".
      lastError =
        controller.signal.aborted && !isNonAbortError(err)
          ? new Error("the upload took too long and was stopped")
          : err;
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastResponse !== undefined) return lastResponse;
  throw lastError;
}

/** A non-abort error that happened to race the timeout keeps its own message. */
function isNonAbortError(err: unknown): boolean {
  return err instanceof Error && err.name !== "AbortError";
}
