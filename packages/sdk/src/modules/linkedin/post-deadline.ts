import type { Clock } from "../../ports";
import type { LinkedInPostResult } from "./types";

export const LINKEDIN_POST_DEADLINE_MS = 3 * 60_000;

// WHY: The gateway finishes a taken post with nobody waiting; a timeout says nothing about LinkedIn. ADR-0024
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
  const answered = () => clock.clearTimeout(timer);
  return Promise.race([post(controller.signal, answered), deadline]).finally(
    () => {
      clock.clearTimeout(timer);
      callerSignal?.removeEventListener("abort", forward);
    },
  );
}
