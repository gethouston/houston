import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  type ClaudeOAuthCredential,
  parseClaudeOAuthEnvelope,
} from "@houston/runtime-client";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import { claudeCredentialsFile } from "./paths";

/**
 * Materialize a pushed Claude subscription OAuth credential as the CLI's own
 * `<CLAUDE_CONFIG_DIR>/.credentials.json` — the exact file the Claude Agent SDK
 * and `claude auth status` read on Linux (the hosted pod). Written verbatim in
 * the CLI envelope (`{claudeAiOauth:{…}}`). On desktop/self-host the full
 * credential lets the SDK self-refresh in place. A managed serve-mode pod must
 * receive an access-only value: the gateway is the refresh family's single
 * rotator, and materializing its refresh token here would violate trap #4 in
 * knowledge-base/anthropic-credentials.md.
 *
 * On a managed pod the file is only an immediate, access-only connected signal
 * at push time. Steady-state, the per-turn served access token rides
 * `CLAUDE_CODE_OAUTH_TOKEN` and outranks this file inside the SDK (see
 * backends/claude/read-token.ts). The file cannot be a refresh fallback because
 * the gateway remains the family's only sanctioned rotator.
 *
 * Atomic (tmp + rename) at mode 0600 so a concurrent reader never sees a
 * half-written file and the token is owner-only on disk.
 *
 * HARD SCOPE GUARD (HOU-976). This file is POD-WIDE: one path, shared by every
 * member of a team space. Materializing a MEMBER's credential into it would
 * (1) hand their Anthropic refresh-token family to every other member of the
 * space and (2) create a second rotator for that family — Anthropic invalidates
 * the previous holder on refresh, so the pod's self-refreshing SDK and the
 * gateway would take turns killing each other's token
 * (knowledge-base/anthropic-credentials.md trap #4). A personal scope therefore
 * REFUSES, loudly: personal Anthropic on a managed pod is served access-only per
 * turn via `CLAUDE_CODE_OAUTH_TOKEN`, which outranks this file anyway (trap #3).
 */
export function writeClaudeOAuthCredentialFile(
  configDir: string,
  cred: ClaudeOAuthCredential,
): void {
  if (isPersonalScope(currentCredentialScope().key))
    throw new Error(
      "refusing to materialize a personal Anthropic credential into the pod-shared Claude login dir: it would be readable by every other member of this space and would create a second refresh-token rotator",
    );
  mkdirSync(configDir, { recursive: true });
  const path = claudeCredentialsFile(configDir);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ claudeAiOauth: cred }), { mode: 0o600 });
  renameSync(tmp, path);
}

/**
 * Whether a materialized credential can still authenticate a turn. The file's
 * EXISTENCE used to be the pod's "connected" signal, but a stale file survives
 * the credential it carried: an access token that expired with no refresh token
 * (or after the refresh token was rotated away by another login — Anthropic
 * rotates on refresh, so a second holder invalidates the first) leaves a file
 * that reads "Connected" while the SDK answers "Not logged in".
 * - a refresh token present → usable (the SDK self-refreshes in place);
 * - no refresh token → usable only until `expiresAt` (absent/0 = no expiry
 *   recorded, treated as usable — mirrors read-token.ts's `expires=0` rule).
 * A revoked-but-unexpired credential is indistinguishable on disk; the
 * turn-failure feedback in auth/credential-health.ts covers that residue.
 */
export function claudeOAuthCredentialUsable(
  cred: ClaudeOAuthCredential,
  now: number = Date.now(),
): boolean {
  if (cred.refreshToken) return true;
  const expires = cred.expiresAt ?? 0;
  return expires <= 0 || expires > now;
}

/**
 * Read `<configDir>/.credentials.json` and judge it: true only when the file
 * exists, parses as the CLI envelope, AND carries a usable credential. An
 * absent, corrupt, or dead file reads false — the caller falls back to the
 * `claude auth status` probe, which owns the Keychain (macOS) answer.
 */
export function claudeCredentialFileUsable(
  path: string,
  now: number = Date.now(),
): boolean {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return false; // absent (the common case) or unreadable — defer to the probe
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return false;
  }
  const parsed = parseClaudeOAuthEnvelope(body);
  return parsed.ok && claudeOAuthCredentialUsable(parsed.value, now);
}
