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
 * error on a POST may have reached the gateway; the caller decides.
 */
export function transientRetryFetch(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const retriable = method === "GET" || method === "HEAD";
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
