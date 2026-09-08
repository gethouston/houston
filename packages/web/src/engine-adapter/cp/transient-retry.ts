/**
 * The read-retry transport: retry a read on the schedule its failure's
 * {@link UnavailableReason} earns.
 *
 * The reasons themselves — the gateway's 5xx vocabulary and the budget each one
 * buys — live in `./unavailable-reason.ts`. This file only decides WHICH
 * responses get read that way and executes the waiting.
 */

import {
  classifyUnavailableBody,
  retryDelaysFor,
  type UnavailableReason,
} from "./unavailable-reason";

/** Gateway/host statuses that are never a real answer to a read. */
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

/**
 * Reads whose CALLER owns the retry schedule, and which must therefore not be
 * retried here as well.
 *
 * Two ladders on one read multiply: assistant discovery runs its own bounded,
 * reason-aware ladder in `app/src/hooks/use-assistant.ts` (5 attempts), and
 * stacking this one under it turned a waking pod into ~25 requests and a
 * minute and a half of spinner before the rail row could settle. The caller's
 * ladder is the better-informed of the two — it reads the failure's own
 * `Retry-After` hint and tells a deployment with no assistant apart from a pod
 * that is merely waking, which a transport cannot.
 */
const CALLER_OWNED_RETRY_PATHS: ReadonlySet<string> = new Set([
  "/v1/assistant",
]);

/** The request's path, or null when the input is not a parseable URL (a
 *  relative string in a non-browser context): unknown paths keep the ladder. */
function pathOf(input: RequestInfo | URL): string | null {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    return new URL(raw, "http://houston.invalid").pathname;
  } catch {
    return null;
  }
}

/**
 * Read a transient response's reason WITHOUT disturbing the body the caller
 * will parse: the classification runs on a clone. A body that isn't the JSON
 * the gateway documents (an HTML error page from an intermediary, an empty
 * 502) classifies as `"handoff"` and keeps the old short patience — the
 * response itself is still returned and still surfaces.
 */
async function reasonFor(res: Response): Promise<UnavailableReason> {
  try {
    return classifyUnavailableBody(await res.clone().json());
  } catch {
    return "handoff";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wrap a fetch so GET/HEAD attempts ride through a rolling deploy, a pod
 * handoff, or an engine pod that is still cold-starting: transient gateway
 * statuses and network-level drops are retried on the schedule their
 * {@link UnavailableReason} earns. Writes never blind-retry — a thrown network
 * error on a POST may have reached the gateway; the caller decides. So does a
 * read on a {@link CALLER_OWNED_RETRY_PATHS} path, for the same reason.
 */
export function transientRetryFetch(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const path = pathOf(input);
    const retriable =
      (method === "GET" || method === "HEAD") &&
      !(path !== null && CALLER_OWNED_RETRY_PATHS.has(path));
    let res: Response | undefined;
    let failure: unknown;
    for (let i = 0; ; i++) {
      failure = undefined;
      res = undefined;
      try {
        res = await inner(input, init);
      } catch (err) {
        failure = err;
      }
      const transient = res === undefined || TRANSIENT_STATUSES.has(res.status);
      if (!transient || !retriable) break;
      // A transport-level drop has no body to read; it is the handoff case by
      // definition (offline, connection reset mid-roll).
      const delays = retryDelaysFor(res ? await reasonFor(res) : "handoff");
      if (i >= delays.length) break;
      await sleep(delays[i]);
    }
    if (res === undefined) throw failure;
    return res;
  };
}
