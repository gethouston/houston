import { type ProbeAnswer, spawnStatusProbe } from "./auth-cli";

/** The probe: resolve a `claude` credential's presence for the shared dir. */
export type CredentialProbe = () => Promise<ProbeAnswer>;

/** Last KNOWN `claude auth status` result for the shared login dir. */
let cache: boolean | undefined;

/** When the cache was last populated (ms epoch), for the coalescing TTL. */
let lastProbeAt = 0;

/** While in the future, skip re-spawning a probe that just failed to answer. */
let unknownBackoffUntil = 0;

/** An in-flight probe, so concurrent callers share ONE subprocess. */
let inFlight: Promise<boolean> | null = null;

/**
 * How long a fresh result is reused before re-spawning the probe. The frontend
 * polls `/providers` and `/providers/usage` on a tight React Query cadence and
 * each hits this. Asymmetric on purpose: a CONNECTED answer is stable (our own
 * routes force a refresh after a login/logout), while a DISCONNECTED one must
 * flip within a poll cycle of the user signing in.
 */
const TTL_CONNECTED_MS = 30_000;
const TTL_DISCONNECTED_MS = 2_000;

/** How long an unanswerable probe is left alone (no subprocess per poll). */
const UNKNOWN_BACKOFF_MS = 15_000;

/**
 * The last KNOWN answer, or `undefined` while no probe has ever answered — the
 * three-state read, for the callers that must not collapse "not asked yet" into
 * "logged out".
 */
export function readCredentialCache(): boolean | undefined {
  return cache;
}

/**
 * Re-probe the shared-dir credential and update the cache. Never throws.
 *
 * An answer we can't trust (thrown spawn error, timeout, garbage) does NOT
 * overwrite the cache: it logs the concrete reason, returns the LAST KNOWN
 * value, and sets a backoff so the poll cadence doesn't spawn a subprocess per
 * request while the probe is broken. `probe` is injected in tests.
 */
export async function refreshAnthropicCredential(
  probe: CredentialProbe = spawnStatusProbe,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  // Reuse a fresh-enough result so a burst of status polls collapses to one
  // spawn. `force` (after a materialize/logout that changed the credential)
  // bypasses BOTH the TTL and the unknown backoff; the first probe (cache still
  // undefined, no backoff) always runs.
  const now = Date.now();
  if (!opts.force) {
    if (now < unknownBackoffUntil) return cache ?? false;
    const ttl = cache === true ? TTL_CONNECTED_MS : TTL_DISCONNECTED_MS;
    if (cache !== undefined && now - lastProbeAt < ttl) return cache;
  }
  // Coalesce concurrent callers onto one in-flight subprocess.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let answer: ProbeAnswer;
    try {
      answer = await probe();
    } catch (err) {
      answer = {
        known: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    if (answer.known) {
      cache = answer.loggedIn;
      unknownBackoffUntil = 0;
      // Only an ANSWER refreshes the TTL clock — see the else branch.
      lastProbeAt = Date.now();
    } else {
      unknownBackoffUntil = Date.now() + UNKNOWN_BACKOFF_MS;
      // The TTL clock is deliberately NOT stamped here: it times how fresh the
      // cached ANSWER is, and this probe produced none. Stamping it made the
      // two knobs stack instead of compose — after the 15s backoff expired, the
      // 30s connected TTL kept blocking, so a broken probe froze the status for
      // 30s rather than the 15s this backoff promises.
      console.warn(
        `[claude] could not read anthropic credential status (${answer.reason}); keeping the last known answer (${cache ?? false})`,
      );
    }
    return cache ?? false;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * Reset the cache directly — used after a logout clears the credential so the
 * card flips to disconnected without waiting for the next probe.
 */
export function resetAnthropicCredentialCache(value = false): void {
  cache = value;
  // Zero the TTL and the backoff so the next `refreshAnthropicCredential`
  // re-probes immediately (a logout/reset must reflect right away).
  lastProbeAt = 0;
  unknownBackoffUntil = 0;
  inFlight = null;
}

/** Test seam: return the cache to the COLD (never-asked) state. */
export function forgetAnthropicCredentialCacheForTest(): void {
  resetAnthropicCredentialCache();
  cache = undefined;
}
