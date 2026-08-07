import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ClaudeOAuthCredential,
  parseClaudeOAuthEnvelope,
} from "@houston/runtime-client";
import { claudeBinary } from "./auth-cli";
import { buildClaudeEnv } from "./backend";
import { claudeCredentialsFile } from "./paths";

/**
 * Subprocess + parsing mechanics for the pod-side Claude login relay: spawning
 * `claude auth login --claudeai` against a throwaway mint dir and reading what
 * it leaves behind. The desktop's Rust runner
 * (`app/src-tauri/src/claude_login/{resolve,runner}.rs`) is the production-
 * proven reference for this child-process contract — `auth login --claudeai`
 * is a plain readline stdio flow (NOT the Ink TUI that `claude setup-token`
 * is), prints its authorize URL on a `visit:` line, and answers its
 * `Paste code here if prompted >` prompt from stdin.
 *
 * Kept separate from `auth/anthropic-cli-login.ts` so the flow driver there
 * stays free of subprocess/filesystem mechanics (and stays injectable in
 * tests) — the same split as `auth-cli.ts` / `credential-status.ts`.
 */

/**
 * The mint dir lives under the OS temp dir, NOT `HOUSTON_HOME`: the store-sync
 * daemon ships `claude-login/.credentials.json` as a NAMED exclude
 * (`packages/host/src/store-sync/daemon.ts`), so a new credential path inside
 * the synced tree would leak token material to the object store on hosts that
 * predate it. The temp dir is pod-local (never synced, gone on recycle), the
 * dir itself is removed after every attempt, and `mkdtemp` gives each login its
 * own dir so concurrent member logins can never read each other's mint.
 */
export function makeMintDir(): string {
  return mkdtempSync(join(tmpdir(), "claude-login-mint-"));
}

/**
 * Best-effort scrub of a mint dir. A pod's tmpfs dies with the pod, but a
 * self-host machine's /tmp can outlive the process — so a failure is loudly
 * logged (path only, never contents): a lingering mint holds a refresh token.
 */
export function removeMintDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.warn(
      `[claude-login] could not remove the login mint dir ${dir} — remove it manually, it may hold credential material: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Strip OSC-8 hyperlink escape sequences (`ESC]8;…;URI BEL|ESC\`): current
 * CLIs wrap the authorize URL in them even on a pipe, which would hide the
 * `visit:` marker's URL token from a plain substring scan.
 */
export function stripOsc8(line: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: OSC-8 is delimited by ESC/BEL by definition
  return line.replace(/\u001b\]8;[^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "");
}

const VISIT_MARKER = "visit:";

/**
 * The authorize URL from one stdout line, or null. Mirrors the desktop's
 * `extract_visit_url` (`resolve.rs`): find the `visit:` marker, take the next
 * whitespace-separated token, accept only http(s), and trim the trailing
 * sentence punctuation the CLI sometimes appends.
 */
export function extractVisitUrl(line: string): string | null {
  const clean = stripOsc8(line);
  const idx = clean.indexOf(VISIT_MARKER);
  if (idx < 0) return null;
  const token = clean
    .slice(idx + VISIT_MARKER.length)
    .trim()
    .split(/\s+/)[0];
  if (!token || !(token.startsWith("http://") || token.startsWith("https://")))
    return null;
  return token.replace(/[.)]+$/, "");
}

/**
 * The credential the CLI cached for the mint dir. On Linux (the pod) and
 * Windows the CLI writes `<CLAUDE_CONFIG_DIR>/.credentials.json`; the relay is
 * gated off macOS (`podCliLoginAvailable`), whose Keychain the runtime cannot
 * read. Throws with a user-fit message — by this point the CLI exited 0, so a
 * missing/garbled file is a real handoff failure, never a fallback trigger.
 */
export function readMintedCredential(mintDir: string): ClaudeOAuthCredential {
  let raw: string;
  try {
    raw = readFileSync(claudeCredentialsFile(mintDir), "utf8");
  } catch {
    throw new Error(
      "Claude sign-in finished, but the CLI left no credential to hand off. Try connecting again.",
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      "Claude sign-in finished, but the minted credential could not be read. Try connecting again.",
    );
  }
  const parsed = parseClaudeOAuthEnvelope(body);
  if (!parsed.ok)
    throw new Error(
      `Claude sign-in finished, but the minted credential is malformed (${parsed.error}). Try connecting again.`,
    );
  return parsed.value;
}

/**
 * Spawn the login CLI against the mint dir. Same env discipline as every other
 * `claude auth` spawn (`buildClaudeEnv`: allowlisted env, credential vars
 * scrubbed, `CLAUDE_CONFIG_DIR` = the mint dir) and the desktop's cwd rule
 * (home, never the inherited cwd — an agent workspace must not shape the CLI).
 */
export function spawnLoginCli(mintDir: string): ChildProcessWithoutNullStreams {
  return spawn(claudeBinary(), ["auth", "login", "--claudeai"], {
    env: buildClaudeEnv(mintDir, undefined),
    cwd: homedir(),
    stdio: ["pipe", "pipe", "pipe"],
  });
}
