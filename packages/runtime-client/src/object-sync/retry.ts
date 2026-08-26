/**
 * Managed pods reach the object store through the gateway, so a single
 * transient blip (gateway restart, DNS hiccup) must not fail a whole boot
 * hydrate or sync-back. Retries are bounded and limited to failures that carry
 * no deterministic answer: network-level rejections thrown by fetch itself,
 * 502/503/504 responses, and gateway 500s that wrap an upstream transient
 * status in the body (the gateway reports GCS failures as
 * `500 {"error":"googleapi: got HTTP response code 503 ..."}`). Every other
 * status is the server's real answer and is returned to the caller unretried.
 */

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

const WRAPPED_TRANSIENT_BODY = /\bgot HTTP response code (?:502|503|504)\b/;

async function isTransientResponse(res: Response): Promise<boolean> {
  if (TRANSIENT_STATUSES.has(res.status)) return true;
  if (res.status !== 500) return false;
  try {
    // Sniff a clone so the caller's body stays readable if this attempt is
    // the one returned.
    return WRAPPED_TRANSIENT_BODY.test(await res.clone().text());
  } catch {
    // An unreadable body cannot prove the 500 wraps a transient upstream
    // failure; the response goes back to the caller as the server's answer.
    return false;
  }
}

/** One delay per retry, so attempts = delays + 1. */
export const DEFAULT_RETRY_DELAYS_MS = [500, 2000];

export interface FetchRetryOptions {
  /** Disable all retries when replaying a write could miss a precondition. */
  retryable?: boolean;
  /** Override to shrink delays (or drop retries) in tests. */
  delaysMs?: number[];
  /** Injectable so tests can observe waits without real timers. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Per-attempt body factory for streaming uploads: a ReadableStream body is
   * consumed by the attempt that sends it, so a retry must open a FRESH stream
   * — a reused one would send an empty or locked body. Buffer bodies don't
   * need this and stay on `init.body`.
   */
  body?: () => BodyInit;
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit | undefined,
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const delays =
    opts.retryable === false ? [] : (opts.delaysMs ?? DEFAULT_RETRY_DELAYS_MS);
  const sleep = opts.sleep ?? realSleep;
  for (let attempt = 0; ; attempt += 1) {
    const lastAttempt = attempt >= delays.length;
    try {
      const attemptInit = opts.body ? { ...init, body: opts.body() } : init;
      const res = await fetchImpl(url, attemptInit);
      if (lastAttempt || !(await isTransientResponse(res))) return res;
    } catch (err) {
      if (lastAttempt) throw err;
    }
    await sleep(delays[attempt] ?? 0);
  }
}
