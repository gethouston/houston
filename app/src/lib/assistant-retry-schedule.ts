// The "how often, and for how long, does discovery ask again?" schedule.
//
// Split from `assistant-availability.ts` (which READS a failure) because the
// two answer different questions: one says what happened, this says what to do
// about it. Both are dependency-free so they load directly under the app's
// node:test runner.

import { classifyAssistantDiscoveryFailure } from "./assistant-availability.ts";

/**
 * RETRIES a transient failure earns — four, so five attempts in all, spanning
 * ~15s of client patience (1s/2s/4s/8s). Sized like the read transport's wake
 * budget (`packages/web/src/engine-adapter/cp/transient-retry.ts`): well past a
 * healthy pod boot, and bounded — a pod that has not come up by then is a
 * capacity problem, and discovery refetches on the next mount or focus anyway.
 */
export const ASSISTANT_TRANSIENT_RETRY_LIMIT = 4;
/** A real failure gets one blind retry: enough for a gateway roll's handoff,
 *  short enough that a genuine bug reaches the reporting path quickly. */
export const ASSISTANT_UNEXPECTED_RETRY_LIMIT = 1;
/** First backoff step; each attempt doubles it. */
export const ASSISTANT_RETRY_BASE_DELAY_MS = 1_000;
/** Floor for a server-advertised hint — never hammer the gateway. */
export const ASSISTANT_RETRY_MIN_DELAY_MS = 500;
/** Ceiling for both the backoff and a hint: waiting longer than this in one
 *  step outlives the screen the user is looking at. */
export const ASSISTANT_RETRY_MAX_DELAY_MS = 8_000;
/**
 * How often discovery asks again once its own ladder is spent on a TRANSIENT
 * failure.
 *
 * A spent ladder is not an answer: the pod was still coming up, and without
 * this the rail row stayed absent for the rest of the session unless the user
 * happened to remount, refocus or reconnect. Slow on purpose — one request a
 * minute costs nothing next to a missing assistant, and the poll ends the
 * moment discovery succeeds or the deployment declares the feature absent.
 */
export const ASSISTANT_TRANSIENT_REFETCH_MS = 60_000;

/**
 * How often to ask again after a failed discovery, or `false` for "do not".
 *
 * Only a TRANSIENT failure earns a beat: absence is final, and a real failure
 * has already been reported (polling it would file the same report every
 * minute). `null`/absent error = the query is not in a failed state.
 */
export function assistantRefetchIntervalMs(error: unknown): number | false {
  if (!error) return false;
  return classifyAssistantDiscoveryFailure(error).kind === "transient"
    ? ASSISTANT_TRANSIENT_REFETCH_MS
    : false;
}

/**
 * Whether discovery should be asked again, given how many attempts have already
 * failed.
 *
 * `failureCount` counts from ZERO for the first failure — the convention
 * `@tanstack/query-core` uses for its own numeric `retry` (`failureCount <
 * retry`), so a limit of N buys exactly N retries and N+1 attempts. Counting it
 * from one made every budget above one attempt larger than its docstring
 * claimed.
 */
export function shouldRetryAssistantDiscovery(
  failureCount: number,
  err: unknown,
): boolean {
  switch (classifyAssistantDiscoveryFailure(err).kind) {
    case "unsupported":
      return false;
    case "transient":
      return failureCount < ASSISTANT_TRANSIENT_RETRY_LIMIT;
    case "unexpected":
      return failureCount < ASSISTANT_UNEXPECTED_RETRY_LIMIT;
  }
}

/**
 * How long to wait before the retry that follows failure `attempt` (counted
 * from zero, like {@link shouldRetryAssistantDiscovery}). A hint the failure
 * advertises wins over the backoff — the
 * server knows when its pod will be ready better than a curve does — clamped
 * so neither a `0` nor a `600000` from the wire can govern the schedule.
 */
export function assistantDiscoveryRetryDelayMs(
  attempt: number,
  err: unknown,
): number {
  const failure = classifyAssistantDiscoveryFailure(err);
  const hint = failure.kind === "transient" ? failure.retryAfterMs : null;
  if (hint !== null) {
    return Math.min(
      Math.max(hint, ASSISTANT_RETRY_MIN_DELAY_MS),
      ASSISTANT_RETRY_MAX_DELAY_MS,
    );
  }
  return Math.min(
    ASSISTANT_RETRY_BASE_DELAY_MS * 2 ** attempt,
    ASSISTANT_RETRY_MAX_DELAY_MS,
  );
}
