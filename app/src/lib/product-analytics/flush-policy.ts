/**
 * WHEN the product-analytics queue ships, and how long it waits when it can't:
 * the debounce, the burst threshold, the batch ceiling, how many times a batch
 * is retried, and the widening re-poll a held pipe backs off on.
 *
 * Its own module so "how often does this send?" is one file rather than five
 * constants scattered through the queue. The scheduler is a type here and an
 * injected dependency there, so a test drives the whole cadence with no timers.
 */

/** Runs `run` after `ms`; the returned function cancels it. */
export type FlushScheduler = (run: () => void, ms: number) => () => void;

/** Long enough to swallow a burst, short enough to survive a quick quit. */
export const FLUSH_DELAY_MS = 3_000;
/** A burst this size ships at once instead of waiting out the debounce. */
export const FLUSH_AT_QUEUED = 25;
/** The route refuses a bigger batch, so a backlog ships in slices. */
export const MAX_BATCH = 100;
/** One send, one retry — a second failure drops the batch. */
export const MAX_ATTEMPTS = 2;
/** Ceiling on the held re-poll: a signed-out app must not poll at the debounce
 *  rate forever, and a session arriving is never more than a minute away. */
const MAX_HOLD_DELAY_MS = 60_000;

/** How long a held pipe waits before asking again, given what it waited last. */
export function nextHoldDelay(currentMs: number): number {
  return currentMs > 0
    ? Math.min(currentMs * 2, MAX_HOLD_DELAY_MS)
    : FLUSH_DELAY_MS;
}

export const defaultSchedule: FlushScheduler = (run, ms) => {
  const handle = setTimeout(run, ms);
  // Never keep the process alive for an analytics flush (tests, shutdown).
  (handle as { unref?: () => void }).unref?.();
  return () => clearTimeout(handle);
};
