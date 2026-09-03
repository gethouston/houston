/**
 * The read-retry transport: what a 502/503/504 from the gateway MEANS, and how
 * long a read waits on each meaning.
 *
 * The managed cloud runs one engine pod per agent and lets it sleep. Opening a
 * chat fires a burst of reads (`read_agent_file`, `list_routines`,
 * `get_skills_manifest`, `list_project_files`) at a pod that may still be
 * booting, and the gateway answers each of them 503. Those 503s are NOT all the
 * same event, and treating them alike is what made a normal cold start look
 * like a crash (HOU-1153):
 *
 *  - **The pod is waking.** The gateway's dispatch self-heal path
 *    (`cloud/internal/edge/agents/routes.go` → `wakeBlocking`) runs ONE 8s
 *    ensure-awake leg and, if the pod still isn't ready, answers
 *    `503 {"error":"engine unavailable","detail":"agent is waking"}` plus a
 *    `Retry-After` — an explicit "ask me again", not a failure. Nothing went
 *    wrong; the answer simply isn't ready yet.
 *  - **The deployment does not run this feature.** The shared-skills routes
 *    answer `503 {"error":"shared skills not configured"}` when the gateway has
 *    no blob store bound (`cloud/internal/edge/shared_skills_routes.go`). That
 *    is a deployment SHAPE, permanent for the session: retrying burns round
 *    trips to be told the same thing.
 *  - **The pod is not accepting connections.** The gateway's per-agent proxy
 *    (`cloud/internal/proxy/forward.go` → `connectWithRetry`) walks a short
 *    dial ladder against a pod it believes is running and, when every dial is
 *    refused, answers `502 {"error":"engine proxy failed","detail":<dial
 *    error>}`. On a read that is the same event as a wake, seen from the other
 *    side: the pod is restarting under an engine roll (a deploy re-rolls every
 *    agent pod), or was just replaced, and the very same request answers once
 *    it listens again. Every deploy day produced a burst of these on the
 *    passive per-agent reads (`list_skills`, `read_agent_file`, ...) that got
 *    the short handoff patience and then surfaced as a bug (PRODUCT-1403 /
 *    HOUSTON-APP-4WQ) — for a pod that was up again seconds later.
 *  - **Anything else** — a gateway roll, a load-balancer handoff, a host that
 *    is restarting — heals in about a second, which is what the original two
 *    blind retries were sized for (HOU-731).
 *
 * `Retry-After` is deliberately NOT read: the gateway sends no
 * `Access-Control-Expose-Headers`, so a browser cannot see that header on a
 * cross-origin gateway response. The BODY is readable, and it carries the same
 * information, so the body is the contract this file keys on.
 *
 * ── Why suppressing the wake toast is not a silent failure ──────────────────
 * The no-silent-failures policy (`CLAUDE.md`) requires every failure a
 * user-initiated action produces to reach the user. A wake 503 that this layer
 * retries to success is not a failure the action produced — the action
 * SUCCEEDED, a little later. Toasting it would report a non-problem and train
 * users to ignore the red toast. When the budget below is exhausted the error
 * is rethrown verbatim and toasts exactly as before, and every other 503 shape
 * keeps its old, short patience. Suppression is bounded by success; nothing is
 * swallowed.
 */

/** Gateway/host statuses that are never a real answer to a read. */
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

/**
 * The gateway's own words. These strings are the wire contract
 * (`cloud/internal/edge/**`); they are parsed HERE and nowhere else, so the
 * rest of the client reasons over the typed {@link UnavailableReason} union
 * rather than over prose.
 */
const ENGINE_UNAVAILABLE = "engine unavailable";
const AGENT_IS_WAKING = "agent is waking";
const ENGINE_PROXY_FAILED = "engine proxy failed";
/**
 * The HOST's own word, not the gateway's (`packages/host/src/channel/
 * probe-wake.ts`): the read-only probe routes (`/providers`, `/providers/usage`,
 * `/auth/status`) race the agent runtime's boot against a short deadline and
 * answer this + `Retry-After: 2` instead of holding the socket for the whole
 * cold boot. The boot keeps running; a retry meets a live runtime.
 */
const RUNTIME_STILL_STARTING =
  "the agent's runtime is still starting, try again shortly";
export const SHARED_SKILLS_UNCONFIGURED = "shared skills not configured";

/** Why a read got no answer — the typed form of the gateway's 5xx body. */
export type UnavailableReason =
  /** The agent's engine pod is cold-starting; the gateway asked us to retry. */
  | "engine-waking"
  /** The gateway could not connect to the agent's pod: it is restarting (an
   *  engine roll) or was just replaced, and answers once it listens again. */
  | "pod-unreachable"
  /** This deployment does not run the feature at all. Retrying cannot help. */
  | "feature-absent"
  /** A gateway roll, an LB handoff, a dropped connection — heals in ~a second. */
  | "handoff";

/**
 * Two brief blind retries, ~2s total — bridges a gateway roll's LB handoff
 * without masking a real outage for long (HOU-731).
 */
export const HANDOFF_RETRY_DELAYS_MS = [500, 1_500] as const;

/**
 * Four extra attempts, 15s of client-side patience, for a pod the gateway has
 * told us is still waking — or could not connect to at all (`pod-unreachable`,
 * the restart-under-a-roll twin of a wake, whose gateway-side cost per attempt
 * is the proxy's ~4s dial ladder instead of the 8s ensure-awake leg).
 *
 * Sized against the gateway, not guessed. Each attempt costs the gateway one
 * `ensure-awake` long-poll leg of up to 8s (`wakeWaitMs`) before it answers
 * "still waking", and the answer advertises `Retry-After: 2` (the control
 * plane's `retryAfterMs`). So five attempts spaced 2s/3s/5s/5s cover roughly
 * 15s of our own waiting plus up to ~40s of gateway-side wake watching — well
 * past a healthy pod boot, which is seconds.
 *
 * Bounded on purpose. Past this the honest answer is an error the user can
 * retry, not a screen that hangs: a pod that has not come up in that long is a
 * crashloop or a capacity problem, and the toast is the bug report we want.
 */
export const WAKE_RETRY_DELAYS_MS = [2_000, 3_000, 5_000, 5_000] as const;

/** A feature this deployment does not run: answer now, do not retry. */
const NO_RETRY_DELAYS_MS = [] as const;

/**
 * Classify a 5xx body. Unrecognized shapes fall back to `"handoff"` — the
 * conservative default, since it keeps the pre-existing behavior for every
 * error the gateway has not taught us to read.
 */
export function classifyUnavailableBody(body: unknown): UnavailableReason {
  const b = body as { error?: unknown; detail?: unknown } | null;
  if (b?.error === SHARED_SKILLS_UNCONFIGURED) return "feature-absent";
  if (b?.error === ENGINE_UNAVAILABLE && b?.detail === AGENT_IS_WAKING) {
    return "engine-waking";
  }
  if (b?.error === ENGINE_PROXY_FAILED) return "pod-unreachable";
  // An explicit "ask me again" from a runtime mid-boot. Under the handoff
  // budget (~2s) every cold boot slower than that surfaced the probe's 503 as
  // a failure of the provider picker (HOUSTON-APP-54Q); it earns the wake
  // budget, which is sized for exactly this boot.
  if (b?.error === RUNTIME_STILL_STARTING) return "engine-waking";
  return "handoff";
}

/** The backoff schedule a reason earns. Empty = answer the first response. */
export function retryDelaysFor(reason: UnavailableReason): readonly number[] {
  switch (reason) {
    case "engine-waking":
    case "pod-unreachable":
      return WAKE_RETRY_DELAYS_MS;
    case "feature-absent":
      return NO_RETRY_DELAYS_MS;
    case "handoff":
      return HANDOFF_RETRY_DELAYS_MS;
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
