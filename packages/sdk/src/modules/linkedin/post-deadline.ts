import type { Clock } from "../../ports";
import type { LinkedInPostResult } from "./types";

/**
 * How long a post may stay unanswered before the surface stops saying
 * Posting. The gateway finishes a post it took even when nobody waits, so
 * running out says nothing about LinkedIn: the post may be up.
 */
export const LINKEDIN_POST_DEADLINE_MS = 3 * 60_000;

/**
 * Runs `post` under {@link LINKEDIN_POST_DEADLINE_MS}. Past it the request is
 * abandoned (aborted on this device only) and the answer is `unknown`, never
 * a refusal: a blind retry could post the same picture twice. Raced rather
 * than awaited, so a transport that ignores the abort still settles. An abort
 * by the caller still rejects with the caller's reason.
 *
 * The deadline covers the wait for an answer only: once `post` calls
 * `answered` (the 2xx headers arrived, so the post is up) the clock stops,
 * and reading the rest is bounded by the post itself.
 */
export function withPostDeadline(
  clock: Clock,
  callerSignal: AbortSignal | undefined,
  post: (
    signal: AbortSignal,
    answered: () => void,
  ) => Promise<LinkedInPostResult>,
): Promise<LinkedInPostResult> {
  const controller = new AbortController();
  const forward = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) forward();
  else callerSignal?.addEventListener("abort", forward, { once: true });
  let timer = 0;
  const deadline = new Promise<LinkedInPostResult>((resolve) => {
    timer = clock.setTimeout(() => {
      resolve({ kind: "unknown" });
      controller.abort();
    }, LINKEDIN_POST_DEADLINE_MS);
  });
  // The race subscribes to both, so the abandoned request's late rejection
  // is handled, not unhandled.
  const answered = () => clock.clearTimeout(timer);
  return Promise.race([post(controller.signal, answered), deadline]).finally(
    () => {
      clock.clearTimeout(timer);
      callerSignal?.removeEventListener("abort", forward);
    },
  );
}
