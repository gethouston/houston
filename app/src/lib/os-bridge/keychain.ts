/**
 * `keychain` category: secrets that must never leave this machine — the macOS
 * Keychain / Windows DPAPI-encrypted file behind `app/src-tauri/src/auth.rs`.
 *
 * The desktop identity session-store round-trips the session JSON blob through
 * the three `auth_*` commands; they are the ONLY invoke calls session-store may
 * use — it must never call `invoke` directly. `osAuthGetItem` resolves null when
 * no entry exists; set/remove reject on failure so session-store surfaces the
 * fault (no silent swallow).
 */

import { invokeNative } from "./invoke.ts";

/** Read the identity session blob for `key`; null when there is no entry. */
export function osAuthGetItem(key: string): Promise<string | null> {
  return invokeNative<string | null>("auth_get_item", { key });
}

/** Write the identity session blob for `key`. Rejects on a storage failure. */
export function osAuthSetItem(key: string, value: string): Promise<void> {
  return invokeNative<void>("auth_set_item", { key, value });
}

/** Remove the identity session blob for `key`. Rejects on a storage failure. */
export function osAuthRemoveItem(key: string): Promise<void> {
  return invokeNative<void>("auth_remove_item", { key });
}

/** Extract the Anthropic OAuth credential the `claude` CLI just cached, as the
 * CLI's `.credentials.json` JSON string (`{claudeAiOauth:{...}}`). Used ONLY
 * for a REMOTE engine (`handoff: true`, the same dir the matching login minted
 * into): the desktop pushes the extracted cred to the pod (which can't read
 * this machine's Keychain). The native side reads the dir's
 * `.credentials.json` or, on macOS, its dir-scoped Keychain item; rejects
 * (never a silent empty) on not-found / parse failure so the caller can fall
 * back to the paste flow. */
export function osReadClaudeCredential(handoff: boolean): Promise<string> {
  return invokeNative<string>("read_claude_credential", { handoff });
}

/** Destroy the handoff dir's cached Claude credential (file + Keychain item)
 * once the push to the gateway has settled: from then on the gateway is the
 * refresh-token family's ONLY rotator, and any surviving local copy is a
 * revocation hazard (HOU-950). Idempotent; rejects with the real reason on a
 * genuine deletion failure (the leftover is inert — nothing reads the handoff
 * dir outside the login flow — so callers log rather than toast). */
export function osDiscardClaudeHandoffCredential(): Promise<void> {
  return invokeNative<void>("discard_claude_handoff_credential");
}
