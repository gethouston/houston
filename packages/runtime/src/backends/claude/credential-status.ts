import { existsSync, rmSync } from "node:fs";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import {
  type ProbeAnswer,
  spawnClaudeLogout,
  spawnStatusProbe,
} from "./auth-cli";
import { claudeCredentialFileUsable } from "./credentials-file";
import { claudeCredentialsFile } from "./paths";

/**
 * Whether a Claude credential is cached FOR Houston's shared login dir.
 *
 * The desktop browser login (`claude auth login`) caches its credential where
 * only the `claude` binary can read it — the macOS Keychain (no file to stat) or
 * `<dir>/.credentials.json` on Linux — and that lookup is SCOPED BY
 * `CLAUDE_CONFIG_DIR`. So the one reliable, cross-platform "is anthropic
 * connected?" signal is to ask the binary itself (`auth-cli.ts`) and read
 * `loggedIn`. There is no artifact we can stat on macOS.
 *
 * That probe is a subprocess, so we cache its result: `providerConnected`
 * (sync, hit at turn time by `activeProvider`) reads the cache, while
 * `getAuthStatus` (the frontend's poll) live-refreshes it — warming the cache
 * for the sync path. The degraded setup-token fallback stores its token in
 * auth.json instead, and `providerConnected` counts that separately.
 *
 * A probe that fails to ANSWER is NOT a logged-out answer. Treating it as one is
 * what flapped the card to "Connect Anthropic" on a signed-in user, so an
 * unknown answer leaves the cache alone, logs the reason, and backs off instead
 * of re-spawning a subprocess per poll.
 */

export type { ProbeAnswer };

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
 * The sync "is anthropic connected?" signal, hit at turn time by
 * `activeProvider`/`providerConnected`.
 *
 * On the POD (Linux) the credential is materialized as a file — a sync read is
 * instant, needs no subprocess, and is correct the moment the file is written.
 * The file must actually be USABLE (`claudeCredentialFileUsable`), not merely
 * present: a stale file whose token expired with no refresh token used to
 * short-circuit this to "connected" — even shadowing a probe that correctly said
 * logged-out — so the AI Models page showed Connected while every turn failed
 * with the reconnect card. macOS-local caches in the Keychain (no file to read),
 * so a missing/dead file falls back to the last probe result.
 *
 * SCOPE (HOU-976): the shared login dir is POD-WIDE — one file, one Keychain
 * entry, serving every member of a team space — so it is the TEAM's credential.
 * A personal scope must not read it as its own: that would report a member
 * "connected" on a credential that is not theirs and then run their turns on
 * it. Under a personal scope the answer comes from that member's own auth file
 * alone (`providerConnected`).
 */
export function anthropicCredentialCached(): boolean {
  if (isPersonalScope(currentCredentialScope().key)) return false;
  if (claudeCredentialFileUsable(claudeCredentialsFile())) return true;
  return cache ?? false;
}

/** Fire-and-forget cache warm at runtime boot (server mode). */
export function primeAnthropicCredential(): void {
  void refreshAnthropicCredential();
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

/**
 * Drop the materialized shared-dir credential after the CENTRAL store
 * authoritatively disconnected anthropic (a serve probe answered
 * not-connected). On a serve-mode pod that file only ever comes from a central
 * push (`credentials-file.ts`), so once the central row is gone any surviving
 * copy is a ghost: the served env token vanished with auth.json, the SDK falls
 * back to this file, and every turn burns a 401 on the dead family with no
 * reporter left to heal it — the served manifest no longer lists anthropic, so
 * `reportRevokedServedToken` no-ops on its provenance gate and the storm
 * sustains until the file's token expires (PRODUCT-1307 / HOUSTON-APP-4YA).
 *
 * A personal scope never owns the shared dir (HOU-976) and must not delete the
 * team's credential on its own disconnect. The cache reset (and its forced
 * re-probe) happens only when a file was actually removed, so the per-turn
 * not-connected sync of an ordinary disconnected pod stays free of subprocess
 * churn.
 */
export function clearGhostClaudeCredential(): void {
  if (isPersonalScope(currentCredentialScope().key)) return;
  const path = claudeCredentialsFile();
  if (!existsSync(path)) return;
  try {
    rmSync(path, { force: true });
  } catch (err) {
    console.warn(
      `[claude] could not remove the ghost materialized credential at ${path}:`,
      err instanceof Error ? err.message : err,
    );
    return;
  }
  console.log(
    "[claude] removed ghost materialized credential: the central store no longer holds an anthropic credential for this workspace",
  );
  resetAnthropicCredentialCache(false);
}

/**
 * Clear the browser-login credential for the shared dir. Rejects on failure so
 * the caller can surface it (no silent failure). The materialized file goes too
 * — on the pod its existence IS the connected signal — and the cache is reset
 * either way, so a failed keychain logout still reports disconnected locally
 * rather than leaving a stale "connected".
 */
export async function logoutAnthropicCredential(): Promise<void> {
  try {
    await spawnClaudeLogout();
  } finally {
    try {
      rmSync(claudeCredentialsFile(), { force: true });
    } catch {
      // Best-effort; the cache reset below still reports disconnected.
    }
    resetAnthropicCredentialCache(false);
  }
}
