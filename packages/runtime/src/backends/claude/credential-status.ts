import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { buildClaudeEnv } from "./backend";
import { resolveClaudeExecutable } from "./binary-path";
import { claudeCredentialsFile, claudeLoginConfigDir } from "./paths";

/**
 * Whether a Claude credential is cached FOR Houston's shared login dir.
 *
 * The desktop browser login (`claude auth login`) caches its credential where
 * only the `claude` binary can read it — the macOS Keychain (no file to stat) or
 * `<dir>/.credentials.json` on Linux — and that lookup is SCOPED BY
 * `CLAUDE_CONFIG_DIR`. So the one reliable, cross-platform "is anthropic
 * connected?" signal is to ask the binary itself: `claude auth status --json`
 * with `CLAUDE_CONFIG_DIR` pinned to `claudeLoginConfigDir()`, and read
 * `loggedIn`. There is no artifact we can stat on macOS.
 *
 * That probe is a subprocess, so we cache its result: `providerConnected`
 * (sync, hit at turn time by `activeProvider`) reads the cache, while
 * `getAuthStatus` (the frontend's poll) live-refreshes it — warming the cache
 * for the sync path. The degraded setup-token fallback stores its token in
 * auth.json instead, and `providerConnected` counts that separately.
 */

/** Last known `claude auth status` result for the shared login dir. */
let cache: boolean | undefined;

/** When the cache was last populated (ms epoch), for the coalescing TTL. */
let lastProbeAt = 0;

/** An in-flight probe, so concurrent callers share ONE subprocess. */
let inFlight: Promise<boolean> | null = null;

/**
 * How long a fresh probe result is reused before re-spawning `claude auth
 * status`. The frontend polls `/providers` and `/auth/status` on a tight React
 * Query cadence and each hits this; without coalescing every poll would spawn a
 * subprocess. Short enough that a just-connected user flips within a poll cycle,
 * long enough to collapse a burst of polls into one spawn.
 */
const PROBE_TTL_MS = 2_000;

/** The probe: resolve a `claude` credential's presence for the shared dir. */
export type CredentialProbe = () => Promise<boolean>;

/**
 * Resolve the spawnable `claude` binary: the bundled sibling inside the compiled
 * desktop sidecar, else `claude` on PATH (dev / self-host). A missing sibling in
 * a packaged build surfaces as an `execFile` ENOENT below (logged, cache=false),
 * never a silent success.
 */
function claudeBinary(): string {
  try {
    return resolveClaudeExecutable() ?? "claude";
  } catch {
    // Bun-compiled but the sibling wasn't staged — fall back to PATH; the spawn
    // error (if `claude` is truly absent) is logged by `refreshAnthropicCredential`.
    return "claude";
  }
}

/** Default probe: `claude auth status --json`, scoped to the shared login dir. */
function spawnStatusProbe(): Promise<boolean> {
  // Scrub ambient credential env vars (buildClaudeEnv with no token) so a stray
  // ANTHROPIC_API_KEY on the host can't make the probe read as connected — we
  // want ONLY the credential cached for `claudeLoginConfigDir()`.
  const env = buildClaudeEnv(claudeLoginConfigDir(), undefined);
  return new Promise<boolean>((resolve, reject) => {
    execFile(
      claudeBinary(),
      ["auth", "status", "--json"],
      { env, timeout: 10_000 },
      (err, stdout) => {
        // A non-zero exit ("Not logged in") is not an error for our purposes:
        // parse whatever JSON we got. A spawn failure (ENOENT) IS an error.
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(err);
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as { loggedIn?: unknown };
          resolve(parsed.loggedIn === true);
        } catch {
          resolve(false);
        }
      },
    );
  });
}

/**
 * Re-probe the shared-dir credential and update the cache. Never throws: a spawn
 * failure logs the concrete reason and reads as NOT connected (the safe answer),
 * so a bad probe surfaces in the logs instead of vanishing. `probe` is injected
 * in tests.
 */
export async function refreshAnthropicCredential(
  probe: CredentialProbe = spawnStatusProbe,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  // Reuse a fresh-enough result so a burst of status polls collapses to one
  // spawn. `force` (after a materialize/logout that changed the credential)
  // bypasses the TTL; the first probe (cache still undefined) always runs.
  if (
    !opts.force &&
    cache !== undefined &&
    Date.now() - lastProbeAt < PROBE_TTL_MS
  ) {
    return cache;
  }
  // Coalesce concurrent callers onto one in-flight subprocess.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      cache = await probe();
    } catch (err) {
      console.warn(
        `[claude] could not read anthropic credential status (${err instanceof Error ? err.message : String(err)}); treating as not connected`,
      );
      cache = false;
    }
    lastProbeAt = Date.now();
    return cache;
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
 * On the POD (Linux) the credential is materialized as a file — a sync stat is
 * instant, needs no subprocess, and is correct the moment the file is written,
 * so there is no cold-start race and no probe spam on the turn path. macOS-local
 * caches in the Keychain (no file to stat), so there we fall back to the last
 * `claude auth status` probe result (warmed by `getAuthStatus`).
 */
export function anthropicCredentialCached(): boolean {
  try {
    if (existsSync(claudeCredentialsFile())) return true;
  } catch {
    // A stat failure just defers to the probe cache below.
  }
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
  // Zero the TTL so the next `refreshAnthropicCredential` re-probes immediately
  // (a logout/reset must reflect right away, not after the TTL window).
  lastProbeAt = 0;
  inFlight = null;
}

/**
 * Clear the browser-login credential for the shared dir: `claude auth logout`.
 * Resets the cache. Rejects on failure so the caller can surface it (no silent
 * failure — a logout the user asked for must either clear the keychain or report
 * why it couldn't).
 */
export function logoutAnthropicCredential(): Promise<void> {
  const env = buildClaudeEnv(claudeLoginConfigDir(), undefined);
  return new Promise<void>((resolve, reject) => {
    execFile(
      claudeBinary(),
      ["auth", "logout"],
      { env, timeout: 10_000 },
      (err) => {
        // Remove the materialized file too (the pod's connected signal is the
        // file's existence); `claude auth logout` clears the Keychain, but the
        // file — if any — must go for the sync signal to flip off.
        try {
          rmSync(claudeCredentialsFile(), { force: true });
        } catch {
          // Best-effort; the status cache reset below still reports disconnected.
        }
        resetAnthropicCredentialCache(false);
        // ENOENT = no bundled binary to log out with; nothing was cached through
        // it either, so treat the local logout as done rather than blocking the
        // user on a helper that isn't there.
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          resolve();
          return;
        }
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });
}
