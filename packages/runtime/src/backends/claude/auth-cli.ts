import { execFile } from "node:child_process";
import { buildClaudeEnv } from "./backend";
import { resolveClaudeExecutable } from "./binary-path";
import { claudeLoginConfigDir } from "./paths";

/**
 * The two `claude auth` subprocesses Houston spawns against its SHARED login dir
 * (`claudeLoginConfigDir()`): the status probe and the logout. Both scrub the
 * ambient credential env (`buildClaudeEnv` with no token) so a stray
 * `ANTHROPIC_API_KEY` on the host can't answer for the credential we're asking
 * about — we want ONLY what is cached for that dir.
 *
 * Kept separate from `credential-status.ts` so the cache/TTL policy there stays
 * free of subprocess mechanics (and stays injectable in tests).
 */

/**
 * What a probe can tell us. `known: false` is NOT "logged out" — it is "the
 * subprocess failed to answer" (timeout, kill, garbled output). Conflating the
 * two is what made the Anthropic card flap to "Connect Anthropic" mid-session.
 */
export type ProbeAnswer =
  | { known: true; loggedIn: boolean }
  | { known: false; reason: string };

/**
 * Resolve the spawnable `claude` binary: the bundled sibling inside the compiled
 * desktop sidecar, else `claude` on PATH (dev / self-host). A missing sibling in
 * a packaged build surfaces as an `execFile` ENOENT below, never a silent
 * success. Shared with the pod-side login relay (`./login-cli`), which spawns
 * the same binary the SDK's turns resolve.
 */
export function claudeBinary(): string {
  try {
    return resolveClaudeExecutable() ?? "claude";
  } catch {
    // Bun-compiled but the sibling wasn't staged — fall back to PATH; the spawn
    // error (if `claude` is truly absent) is logged by the caller.
    return "claude";
  }
}

/**
 * Read a status-probe outcome. KNOWN only when stdout parses as JSON carrying a
 * boolean `loggedIn` — anything else (killed child, empty stdout, non-JSON, a
 * shape we don't recognize) is "couldn't tell", never "logged out". A non-zero
 * exit is NOT itself a failure: `claude auth status` exits non-zero while still
 * printing a valid `{"loggedIn": false}`.
 *
 * Pure over its inputs so every branch is testable without a subprocess.
 */
export function readProbeOutcome(
  err: (Error & { killed?: boolean; signal?: NodeJS.Signals | null }) | null,
  stdout: string,
): ProbeAnswer {
  // `timeout` kills the child: no output, no verdict.
  if (err?.killed || err?.signal) {
    return {
      known: false,
      reason: `probe killed (${err.signal ?? "timeout"})`,
    };
  }
  if (!stdout.trim())
    return { known: false, reason: "probe produced no output" };
  let parsed: { loggedIn?: unknown };
  try {
    parsed = JSON.parse(stdout) as { loggedIn?: unknown };
  } catch {
    return { known: false, reason: "probe output was not JSON" };
  }
  if (typeof parsed.loggedIn !== "boolean") {
    return { known: false, reason: "no boolean `loggedIn` in output" };
  }
  return { known: true, loggedIn: parsed.loggedIn };
}

/**
 * `claude auth status --json`, scoped to the shared login dir. Rejects on ENOENT
 * (no binary to ask — its own failure mode); every other outcome is read by
 * `readProbeOutcome`.
 */
export function spawnStatusProbe(): Promise<ProbeAnswer> {
  const env = buildClaudeEnv(claudeLoginConfigDir(), undefined);
  return new Promise<ProbeAnswer>((resolve, reject) => {
    execFile(
      claudeBinary(),
      ["auth", "status", "--json"],
      { env, timeout: 10_000 },
      (err, stdout) => {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(err);
          return;
        }
        resolve(readProbeOutcome(err, stdout));
      },
    );
  });
}

/**
 * `claude auth logout` for the shared dir — clears the Keychain entry. Rejects
 * on failure so the caller can surface it (a logout the user asked for must
 * either clear the credential or report why it couldn't). ENOENT resolves: there
 * is no bundled binary to log out with, and nothing was ever cached through it.
 */
export function spawnClaudeLogout(): Promise<void> {
  const env = buildClaudeEnv(claudeLoginConfigDir(), undefined);
  return new Promise<void>((resolve, reject) => {
    execFile(
      claudeBinary(),
      ["auth", "logout"],
      { env, timeout: 10_000 },
      (err) => {
        if (err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });
}
