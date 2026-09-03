import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnCli } from "./anthropic-cli-binary";
import {
  discardMintedCredential,
  type MintedCredentialDeps,
  readMintedCredential,
} from "./anthropic-cli-credential";
import type {
  AnthropicLoginCallbacks,
  CliMintedOauth,
  LoginChild,
} from "./anthropic-cli-output";
import {
  CliUnavailableError,
  extractVisitUrl,
  scrubTokens,
  wireLines,
} from "./anthropic-cli-output";
import {
  isAnthropicToken,
  runAnthropicSetupTokenLogin,
  storeAnthropicToken,
} from "./anthropic-setup-token";

/**
 * Claude SUBSCRIPTION connect driven by the bundled Claude Code CLI — the one
 * sanctioned OAuth client — running NEXT TO THE RUNTIME (engine pod, self-host,
 * a web-backed cloud agent). No terminal, no desktop helper:
 *
 *   1. Spawn `claude auth login --claudeai` piped (a plain readline flow, NOT
 *      an Ink TUI — the desktop shell has driven it piped since HOU-954) with
 *      `CLAUDE_CONFIG_DIR` pointed at a throwaway dir, so the minted credential
 *      never lands in the pod-shared login dir.
 *   2. Surface the authorize URL from its `visit:` line as the `auth_code`
 *      LoginInfo (no `instructions` → the webapp renders open-URL + paste-code).
 *      The callback page cannot reach the CLI's listener from another machine,
 *      so it shows a code the user pastes back (`completeLogin` → stdin here);
 *      a co-located listener may catch it seamlessly — the CLI just exits 0.
 *   3. On exit 0, read the minted OAuth credential back — the login dir's
 *      credential file, or on macOS the Keychain item the CLI writes instead
 *      (anthropic-cli-credential.ts) — and persist it via `storeOauth` as a
 *      standard pi `oauth` auth.json entry, destroying every other copy. The EXISTING
 *      chain takes over: capture exports it, the gateway stores + rotates it
 *      centrally (the family's ONLY rotator), Gate #2 scrubs the local refresh,
 *      serve keeps it warm.
 *
 * Where the host never serves anthropic back (desktop, self-host — `login.ts`
 * passes `sharedLoginDir`, PRODUCT-1644) the CLI runs IN the shared login dir
 * instead: the credential it caches there (Keychain on macOS, the credential
 * file elsewhere) is what every agent runtime's status probe and the Claude
 * SDK read, exactly as the desktop's own browser login leaves it. Nothing is
 * stored in auth.json and nothing is discarded — the capture that follows has
 * nothing to export, and the host settles it against the runtime's status.
 *
 * A pasted `sk-ant-…` value in the same input still short-circuits to the
 * token flow (kill the child, store an api_key) — the old escape hatch.
 */

export type AnthropicLoginDeps = MintedCredentialDeps & {
  /** The spawnable CLI, or null to go straight to the token paste flow. */
  binary: string | null;
  /** Persist a pasted `sk-ant-…` value as pi's `api_key` variant. */
  storeToken: (key: string) => void;
  /** Persist the CLI-minted subscription credential as pi's `oauth` variant. */
  storeOauth: (cred: CliMintedOauth) => void;
  /**
   * Run the CLI login IN this dir and leave the credential there (see the
   * module note): the single holder on a host that never serves anthropic.
   * Null/absent = the throwaway dir + auth.json + capture chain.
   */
  sharedLoginDir?: string | null;
  // Test seams; production uses the real spawn/tmpdir.
  spawnChild?: (binary: string, configDir: string) => LoginChild;
  mkLoginDir?: () => string;
};

/**
 * The anthropic connect: the CLI subscription login when a CLI can run here,
 * the token paste flow otherwise — including when the CLI dies BEFORE the
 * authorize URL was surfaced (nothing user-visible happened yet, so the
 * downgrade is seamless). After the URL, a CLI failure surfaces as an error.
 */
export async function runAnthropicLogin(
  cb: AnthropicLoginCallbacks,
  deps: AnthropicLoginDeps,
): Promise<void> {
  if (deps.binary) {
    try {
      console.log(
        `[oauth:anthropic] Claude CLI subscription login via ${deps.binary}`,
      );
      await runAnthropicCliLogin(cb, deps, deps.binary);
      return;
    } catch (e) {
      if (!(e instanceof CliUnavailableError)) throw e;
      console.warn(
        "[oauth:anthropic] Claude CLI login cannot start here — falling back to the token paste flow:",
        e.message,
      );
    }
  }
  await runAnthropicSetupTokenLogin(cb, { store: deps.storeToken });
}

async function runAnthropicCliLogin(
  cb: AnthropicLoginCallbacks,
  deps: AnthropicLoginDeps,
  binary: string,
): Promise<void> {
  const shared = deps.sharedLoginDir ?? null;
  const dir =
    shared ??
    (
      deps.mkLoginDir ??
      (() => mkdtempSync(join(tmpdir(), "houston-claude-login-")))
    )();
  const child = (deps.spawnChild ?? spawnCli)(binary, dir);
  try {
    await driveCliLogin(child, cb, deps, dir);
  } finally {
    try {
      child.kill();
    } catch {
      // Already exited — nothing to kill.
    }
    // The shared dir IS the credential's home; only a throwaway is destroyed.
    if (!shared) await discardMintedCredential(dir, deps);
  }
}

async function driveCliLogin(
  child: LoginChild,
  cb: AnthropicLoginCallbacks,
  deps: AnthropicLoginDeps,
  dir: string,
): Promise<void> {
  const tail: string[] = [];
  let url: string | null = null;
  let urlFoundResolve!: () => void;
  const urlFound = new Promise<void>((r) => {
    urlFoundResolve = r;
  });
  const onLine = (line: string) => {
    const t = line.trim();
    if (t) tail.push(t);
    if (tail.length > 12) tail.shift();
    if (url) return;
    const u = extractVisitUrl(line);
    if (u) {
      url = u;
      urlFoundResolve();
    }
  };
  wireLines(child.stdout, onLine);
  wireLines(child.stderr, onLine);
  const exit = new Promise<number>((resolve, reject) => {
    child.once("exit", (code, signal) => resolve(code ?? (signal ? -1 : 0)));
    child.once("error", (e) =>
      reject(
        new CliUnavailableError(`could not spawn the Claude CLI: ${e.message}`),
      ),
    );
  });

  // Phase 1: the authorize URL — or an exit first, meaning the CLI cannot run
  // here (SIGILL, startup gate): downgradable, nothing was surfaced yet.
  await Promise.race([
    urlFound,
    exit.then((code) => {
      throw new CliUnavailableError(
        `the Claude CLI exited (${code}) before the sign-in URL: ${scrubTokens(tail.join(" | "))}`,
      );
    }),
  ]);
  if (!url) throw new Error("unreachable: URL race settled without a URL");
  cb.onAuth({ url });

  // Phase 2: the user's paste — or the CLI settling on its own (a co-located
  // browser reached its listener: seamless success at exit 0).
  const outcome = await Promise.race([
    cb.onManualCodeInput().then((value) => ({ kind: "input" as const, value })),
    exit.then((code) => ({ kind: "exit" as const, code })),
  ]);
  if (outcome.kind === "input") {
    const pasted = outcome.value.trim();
    if (isAnthropicToken(pasted)) {
      // Power-user escape hatch: an sk-ant-… value in the same input is the
      // old token flow — the CLI child is abandoned (killed in the finally).
      storeAnthropicToken(pasted, deps.storeToken);
      return;
    }
    child.stdin.write(`${pasted}\n`);
  }
  const code = outcome.kind === "exit" ? outcome.code : await exit;
  if (code !== 0)
    throw new Error(
      `Claude sign-in failed (exit ${code}): ${scrubTokens(tail.join(" | "))}`,
    );

  // Read back either way: a CLI that exited 0 without caching a credential
  // fails loud here rather than reporting a connect that never happened.
  const minted = await readMintedCredential(dir, deps);
  if (!deps.sharedLoginDir) deps.storeOauth(minted);
}
