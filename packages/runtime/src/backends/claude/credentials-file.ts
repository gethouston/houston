import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  type ClaudeOAuthCredential,
  parseClaudeOAuthEnvelope,
} from "@houston/runtime-client";
import { claudeCredentialsFile } from "./paths";

/**
 * Materialize a pushed Claude subscription OAuth credential as the CLI's own
 * `<CLAUDE_CONFIG_DIR>/.credentials.json` — the exact file the Claude Agent SDK
 * and `claude auth status` read on Linux (the hosted pod). Written verbatim in
 * the CLI envelope (`{claudeAiOauth:{…}}`) so the SDK can self-refresh from the
 * refresh token in place.
 *
 * Role after the connect-once serve landed: the file is the pod's IMMEDIATE
 * connected signal at push time and the FALLBACK credential when no served
 * token is available (control plane briefly unreachable, or it can't refresh
 * anthropic yet). Steady-state on a managed pod, the per-turn served access
 * token rides `CLAUDE_CODE_OAUTH_TOKEN` and OUTRANKS this file inside the SDK
 * (see backends/claude/read-token.ts and knowledge-base/
 * anthropic-credentials.md) — which is exactly why the host must never serve
 * a stale anthropic token (routes/credential.ts guards it).
 *
 * Atomic (tmp + rename) at mode 0600 so a concurrent reader never sees a
 * half-written file and the token is owner-only on disk. The refresh token in
 * this file stays on the single-tenant, network-policied pod — a documented,
 * EXPLICITLY scoped departure from Gate #2 (see cloud/INTEGRATION.md); it is
 * never written into the multi-tenant per-turn Cloud Run process, which keeps
 * Anthropic off there.
 */
export function writeClaudeOAuthCredentialFile(
  configDir: string,
  cred: ClaudeOAuthCredential,
): void {
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
