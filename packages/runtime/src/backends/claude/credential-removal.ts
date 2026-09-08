import { existsSync, rmSync } from "node:fs";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import { spawnClaudeLogout } from "./auth-cli";
import { resetAnthropicCredentialCache } from "./credential-probe-cache";
import { claudeCredentialsFile } from "./paths";

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
 *
 * Returns whether a credential was actually dropped, so the sync that asked for
 * it can name this provider in its own removal log line.
 */
export function clearGhostClaudeCredential(): boolean {
  if (isPersonalScope(currentCredentialScope().key)) return false;
  const path = claudeCredentialsFile();
  if (!existsSync(path)) return false;
  try {
    rmSync(path, { force: true });
  } catch (err) {
    console.warn(
      `[claude] could not remove the ghost materialized credential at ${path}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
  console.log(
    "[claude] removed ghost materialized credential: the central store no longer holds an anthropic credential for this workspace",
  );
  resetAnthropicCredentialCache(false);
  return true;
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
