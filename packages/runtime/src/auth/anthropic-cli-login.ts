import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { ClaudeOAuthCredential } from "@houston/runtime-client";
import { refreshAnthropicCredential } from "../backends/claude/credential-status";
import { writeClaudeOAuthCredentialFile } from "../backends/claude/credentials-file";
import {
  extractVisitUrl,
  makeMintDir,
  readMintedCredential,
  removeMintDir,
  spawnLoginCli,
} from "../backends/claude/login-cli";
import { claudeLoginConfigDir } from "../backends/claude/paths";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../session/acting-context";
import { runAnthropicSetupTokenLogin } from "./anthropic-setup-token";
import { serveModeOn } from "./serve";
import { authStorage } from "./storage";

/**
 * Pod-side Claude (subscription) connect: mint the OAuth credential ON the
 * engine pod by driving the pod's own `claude auth login --claudeai`, so a
 * user installs NOTHING locally — the desktop helper binary (which SIGILLs on
 * pre-AVX2 CPUs) and the `claude setup-token` terminal detour both stop being
 * requirements. Zero wire change: the authorize URL rides the existing
 * `auth_code` LoginInfo to the client, and the code the user pastes (the
 * claude.ai approval page always shows one here — the pod's localhost callback
 * listener is unreachable from the user's browser, the deterministic Windows
 * fallback of HOU-839) comes back through `completeLogin` into the CLI's stdin.
 *
 * Custody after the mint follows the standing doctrine
 * (knowledge-base/anthropic-credentials.md): the full credential seeds
 * auth.json so the client's connect-once capture (`captureCredential` → the
 * runtime's `GET /auth/export` → central store put → refresh scrub) makes the
 * gateway the family's single rotator, and the team-scope pod materializes the
 * CLI's own file exactly like a desktop push would (access-only in serve mode).
 * The throwaway mint dir is scrubbed win or lose.
 *
 * Where the CLI cannot run — the binary is absent (the CLOUD-only per-turn
 * image strips it), the platform hides the mint in a Keychain (macOS), the
 * kill switch is set, or the spawned child dies/goes silent BEFORE printing
 * its authorize URL (the probed Ink-TUI deadlock shape: zero bytes, no clean
 * error) — the flow degrades to the setup-token paste dialog, the previous
 * behavior and the terminal fallback. After the URL reached the user, a
 * failure is a real sign-in failure (declined approval, bad code) and
 * surfaces as one; silently restarting as a different dialog would be worse.
 */

/** What the user sees next to the paste box (the `auth_code` dialog). */
export const CLI_LOGIN_INSTRUCTIONS =
  "Open the link below and approve the sign-in in your browser. When claude.ai shows you a code, copy it and paste it here.";

/**
 * Kill switch. `HOUSTON_CLAUDE_POD_LOGIN=0` pins the setup-token paste flow —
 * the operational lever if a CLI update ever breaks the piped readline contract
 * in production (and what keeps `login.test.ts` off real subprocess spawns).
 */
export const POD_LOGIN_ENV = "HOUSTON_CLAUDE_POD_LOGIN";

/**
 * A failure mode that means "this pod cannot run the CLI login at all" — the
 * only failures that degrade to the setup-token flow. Thrown exclusively
 * BEFORE the authorize URL is emitted, so a fallback never yanks a dialog the
 * user is already following.
 */
export class CliLoginUnavailableError extends Error {}

export type CliLoginCallbacks = {
  /** Surface the authorize URL + paste instructions to the client (auth_code). */
  onAuth: (info: { url: string; instructions: string }) => void;
  /** Resolves with the user's pasted approval code (completeLogin's promise). */
  onManualCodeInput: () => Promise<string>;
};

/** Subprocess/filesystem seams, injectable in tests (`./login-cli` reals). */
export type CliLoginIo = {
  makeMintDir: () => string;
  removeMintDir: (dir: string) => void;
  spawn: (mintDir: string) => ChildProcessWithoutNullStreams;
  readCredential: (mintDir: string) => ClaudeOAuthCredential;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /**
   * How long the CLI gets to print its `visit:` line. Must undercut
   * `startLogin`'s 15s info race with room for the fallback's instant emit; a
   * CLI that goes silent past this is treated as unable to run here.
   */
  urlTimeoutMs: number;
  /**
   * Backstop child lifetime. The abandoned-login expiry (login.ts, 10 min)
   * aborts first in every wired flow; this only reaps a child nothing owns.
   */
  exitTimeoutMs: number;
};

export const defaultCliLoginIo: CliLoginIo = {
  makeMintDir,
  removeMintDir,
  spawn: spawnLoginCli,
  readCredential: readMintedCredential,
  platform: process.platform,
  env: process.env,
  urlTimeoutMs: 10_000,
  exitTimeoutMs: 15 * 60_000,
};

/**
 * Whether this runtime may attempt the pod-side CLI login at all. macOS is
 * excluded because the CLI caches the mint in the dir-scoped Keychain there —
 * no file for `readMintedCredential` to extract (and no macOS pod exists; a
 * co-located mac uses the desktop's own login, which owns Keychain reads).
 */
export function podCliLoginAvailable(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): { ok: true } | { ok: false; reason: string } {
  if (env[POD_LOGIN_ENV] === "0")
    return { ok: false, reason: `${POD_LOGIN_ENV}=0` };
  if (platform === "darwin")
    return {
      ok: false,
      reason: "macOS caches the mint in the Keychain, not a readable file",
    };
  return { ok: true };
}

/** Longest stderr tail kept for the failure message (desktop parity). */
const STDERR_TAIL_MAX = 2_000;

/**
 * Drive one spawned login child to a terminal outcome: relay its authorize
 * URL, feed it the pasted code, and classify how it ends. Every pre-URL death
 * (spawn error, signal, non-zero exit, silence past `urlTimeoutMs`) rejects
 * `CliLoginUnavailableError` = fallback-eligible; post-URL failures and
 * cancellation reject plain errors. Always settles before killing, so a kill's
 * own close event can never reclassify the outcome.
 */
function driveLoginChild(
  child: ChildProcessWithoutNullStreams,
  cb: CliLoginCallbacks,
  signal: AbortSignal | undefined,
  io: CliLoginIo,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let urlSeen = false;
    let settled = false;
    let stderrTail = "";
    const tail = () => {
      const t = stderrTail.trim();
      return t ? `: ${t}` : "";
    };

    let urlTimer: NodeJS.Timeout | undefined;
    let exitTimer: NodeJS.Timeout | undefined;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      if (urlTimer) clearTimeout(urlTimer);
      if (exitTimer) clearTimeout(exitTimer);
      signal?.removeEventListener("abort", onAbort);
      outcome();
    };
    const fail = (e: Error) => settle(() => reject(e));
    // The fallback gate: only a failure the user never saw a URL for may
    // degrade to the setup-token dialog.
    const failClassified = (detail: string) =>
      fail(urlSeen ? new Error(detail) : new CliLoginUnavailableError(detail));

    const onAbort = () => {
      // Settle first: the kill's close event must not re-label a user cancel
      // as a fallback-eligible signal death.
      fail(new Error("login cancelled"));
      child.kill();
    };

    urlTimer = setTimeout(() => {
      failClassified(
        `the pod Claude CLI printed no authorize URL within ${io.urlTimeoutMs / 1000}s`,
      );
      child.kill();
    }, io.urlTimeoutMs);
    urlTimer.unref?.();
    exitTimer = setTimeout(() => {
      fail(new Error("Claude sign-in timed out"));
      child.kill();
    }, io.exitTimeoutMs);
    exitTimer.unref?.();

    child.on("error", (e) =>
      failClassified(`the pod Claude CLI could not run: ${e.message}`),
    );
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrTail = (stderrTail + String(chunk)).slice(-STDERR_TAIL_MAX);
    });
    // A dead readline (pasted after a decline already closed stdin) is the
    // close handler's outcome to report, not a crash.
    child.stdin.on("error", () => {});

    createInterface({ input: child.stdout }).on("line", (line) => {
      if (urlSeen) return;
      const url = extractVisitUrl(line);
      if (!url) return;
      urlSeen = true;
      if (urlTimer) clearTimeout(urlTimer);
      cb.onAuth({ url, instructions: CLI_LOGIN_INSTRUCTIONS });
    });

    cb.onManualCodeInput().then(
      (code) => {
        // Answers the CLI's `Paste code here if prompted >` readline. A write
        // racing the child's death may throw synchronously; the close handler
        // owns that outcome, and this floating then-chain must never carry an
        // unhandled rejection.
        try {
          if (!settled && child.stdin.writable)
            child.stdin.write(`${code.trim()}\n`);
        } catch {
          // Stream torn down between the check and the write.
        }
      },
      () => {
        // Cancel/expiry rejected the paste promise; the abort teardown (or the
        // fallback flow now awaiting this same promise) owns the outcome.
      },
    );

    child.on("close", (code, sig) => {
      if (sig) {
        // A signal is never a user decision (declines exit with a code) — the
        // desktop's `helperUnavailable` rule, which pre-URL means fallback.
        failClassified(`Claude sign-in failed (${sig})${tail()}`);
        return;
      }
      if (code !== 0) {
        failClassified(`Claude sign-in failed (exit ${code})${tail()}`);
        return;
      }
      if (!urlSeen) {
        // A fresh mint dir has no cached session, so a real login ALWAYS
        // prints the authorize URL first — a clean exit without one is a CLI
        // that cannot run this flow here, not a mint. Resolving would store
        // nothing while `startLogin`'s info race times out on a dialog that
        // never opened.
        failClassified(
          `the pod Claude CLI exited without printing an authorize URL${tail()}`,
        );
        return;
      }
      settle(resolve);
    });

    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Run the pod-side CLI login end to end: spawn against a fresh mint dir, relay
 * URL + code, then extract the minted credential and hand it to `store`. The
 * mint dir is removed on every path — after a successful extraction the only
 * durable copies are the ones `store` placed deliberately.
 */
export async function runAnthropicCliLogin(
  cb: CliLoginCallbacks,
  deps: {
    store: (cred: ClaudeOAuthCredential) => Promise<void> | void;
    signal?: AbortSignal;
  },
  io: CliLoginIo = defaultCliLoginIo,
): Promise<void> {
  const gate = podCliLoginAvailable(io.platform, io.env);
  if (!gate.ok) throw new CliLoginUnavailableError(gate.reason);
  const mintDir = io.makeMintDir();
  try {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = io.spawn(mintDir);
    } catch (e) {
      throw new CliLoginUnavailableError(
        `could not spawn the pod Claude CLI: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    await driveLoginChild(child, cb, deps.signal, io);
    const cred = io.readCredential(mintDir);
    await deps.store(cred);
  } finally {
    io.removeMintDir(mintDir);
  }
}

/** Storage/materialization seams for the mint sink, injectable in tests. */
export type MintSinkIo = {
  storage: Pick<typeof authStorage, "set">;
  serveMode: () => boolean;
  personalScope: () => boolean;
  materialize: (configDir: string, cred: ClaudeOAuthCredential) => void;
  loginDir: () => string;
  warmProbe: () => Promise<unknown>;
};

const defaultMintSinkIo: MintSinkIo = {
  storage: authStorage,
  serveMode: serveModeOn,
  personalScope: () => isPersonalScope(currentCredentialScope().key),
  materialize: writeClaudeOAuthCredentialFile,
  loginDir: claudeLoginConfigDir,
  warmProbe: () => refreshAnthropicCredential(undefined, { force: true }),
};

/**
 * Place a pod-minted credential exactly where the sanctioned flows expect it.
 *
 * 1. auth.json (the ACTING scope's file, via the scope-aware store): the full
 *    access+refresh entry is what `GET /auth/export` hands the host's
 *    connect-once capture — central store put, then refresh scrub — making the
 *    gateway the family's single rotator, the same end state as a desktop
 *    push. Until that capture lands, the serve sync's mid-capture guard
 *    (`applyServedCredential` refuses over a refresh-bearing entry) protects
 *    it, like every other provider's device-code connect window.
 * 2. Team scope only: materialize the CLI's own shared-dir file exactly like a
 *    desktop push (`handleClaudeOAuthCredential`) — full credential on
 *    self-host so the SDK self-refreshes in place, access-only in serve mode
 *    (trap #4), then warm the connected probe so status flips immediately. A
 *    personal scope must never touch the pod-shared file (HOU-976) — the
 *    member's turns ride the per-turn served `CLAUDE_CODE_OAUTH_TOKEN`.
 */
export async function storeMintedClaudeCredential(
  cred: ClaudeOAuthCredential,
  io: MintSinkIo = defaultMintSinkIo,
): Promise<void> {
  io.storage.set("anthropic", {
    type: "oauth",
    access: cred.accessToken,
    refresh: cred.refreshToken ?? "",
    expires: cred.expiresAt ?? 0,
  });
  if (io.personalScope()) return;
  io.materialize(
    io.loginDir(),
    io.serveMode() ? { ...cred, refreshToken: "" } : cred,
  );
  await io.warmProbe();
}

/**
 * The anthropic connect `startLogin` runs: the pod-side CLI relay, degrading
 * to the setup-token paste flow only when the relay is unavailable on this pod
 * (`CliLoginUnavailableError` — always pre-URL, so the dialog never switches
 * under the user). Both flows share the same `auth_code` wire shape and the
 * same single-shot paste promise.
 */
export async function runAnthropicConnect(
  cb: CliLoginCallbacks,
  deps: {
    storeCredential?: (cred: ClaudeOAuthCredential) => Promise<void> | void;
    storeToken: (key: string) => void;
    signal?: AbortSignal;
  },
  io: CliLoginIo = defaultCliLoginIo,
): Promise<void> {
  try {
    await runAnthropicCliLogin(
      cb,
      {
        store: deps.storeCredential ?? storeMintedClaudeCredential,
        signal: deps.signal,
      },
      io,
    );
    return;
  } catch (e) {
    if (!(e instanceof CliLoginUnavailableError)) throw e;
    console.warn(
      `[claude-login] pod CLI sign-in unavailable (${e.message}); degrading to the setup-token paste flow`,
    );
  }
  await runAnthropicSetupTokenLogin(
    { onAuth: cb.onAuth, onManualCodeInput: cb.onManualCodeInput },
    { store: deps.storeToken },
  );
}
