/**
 * Bounded transient retry for control-plane READS that boot the app.
 *
 * `cpFetch` already blind-retries 502/503/504 twice (~2s, `transientRetryFetch`)
 * — enough to ride a load-balancer handoff, nowhere near a pod cold start or a
 * longer gateway roll. Reads whose failure has a lasting consequence (the
 * workspace list decides which SPACE the whole session runs in) wrap themselves
 * here for a second, slower layer of attempts before they give up and throw.
 *
 * Deliberately NOT applied to every read: a retry costs the user latency, and
 * most reads are re-triggered cheaply by the query layer.
 */

import { HoustonEngineError } from "../client/errors";

/**
 * Extra attempts on top of `cpFetch`'s own, ~4s of additional patience. Two
 * attempts, not five: past a few seconds the honest answer is an error the user
 * can retry, not a boot that hangs.
 */
export const READ_RETRY_DELAYS_MS = [1_000, 3_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A failure worth another attempt: a gateway/host 5xx (rolling deploy, pod
 * waking, brief unavailability) or a transport-level drop (offline, connection
 * reset — `fetch` rejects with a `TypeError`). A 4xx is terminal: auth,
 * not-found, and bad-request never heal by retrying.
 */
export function isTransientHostError(err: unknown): boolean {
  if (err instanceof HoustonEngineError) return err.status >= 500;
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status >= 500;
  return err instanceof TypeError;
}

/**
 * Run `read`, retrying only transient failures on the given backoff. The last
 * failure is rethrown verbatim so the caller surfaces the host's real reason.
 */
export async function retryTransientRead<T>(
  read: () => Promise<T>,
  delays: readonly number[] = READ_RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (err) {
      if (attempt >= delays.length || !isTransientHostError(err)) throw err;
      await sleep(delays[attempt]);
    }
  }
}
