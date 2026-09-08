import type { Credential } from "@earendil-works/pi-ai";
import { serveModeOn } from "./serve-context";

/**
 * PRODUCT-1317: no empty-string refresh token ever leaves this process.
 *
 * Gate #2 stores a served credential as `{type:"oauth", access, refresh:"",
 * expires}` (auth-file.ts) — the refresh token deliberately never reaches the
 * runtime. pi-ai 0.84.1 does not know that shape: `resolveStoredOAuth`
 * (dist/auth/resolve.js) routes ANY stored OAuth entry within 5 minutes of
 * expiry through `oauth.refresh(current)`, and every provider refresher POSTs
 * `credential.refresh` verbatim to its token endpoint. A served entry that pi
 * sees inside that window therefore fired `refresh_token=""` at the provider
 * (openai-codex), or minted with `Bearer ""` and 401'd into a spurious
 * reconnect card (github-copilot) — PRODUCT-1293 in production. The gateway
 * serves with exactly pi's 5-minute margin, so "already inside the window" is
 * a recurring state, not a corner case.
 *
 * The guard lives at the Houston-owned seam pi consumes — `HoustonAuthStore`,
 * pi's `CredentialStore` — never in a pi patch, in two halves:
 *  - `read`: an access-only entry already inside pi's window re-syncs from the
 *    control plane first (`needsServeSync` + the bound single-flighted serve
 *    sync), so a fresh central token lands before pi's expiry check runs;
 *  - `modify`: pi's refresh closures dereference the `current` credential —
 *    `maskAccessOnly` hands them `undefined` for an access-only entry, which
 *    takes their own "logged out meanwhile" branch (dist/auth/resolve.js):
 *    the entry is left unchanged and pi serves the stored access token as-is
 *    through `toAuth` (side-effect-free per its `OAuthAuth` contract). The
 *    token's remaining validity still gets used; once it truly expires the
 *    request 401s into the typed unauthenticated/token_expired card — never a
 *    provider POST carrying the empty string.
 */

/** pi-ai's `DEFAULT_OAUTH_MINIMUM_VALIDITY_MS` (dist/auth/resolve.js). */
export const PI_OAUTH_MIN_VALIDITY_MS = 5 * 60 * 1000;

/** A Gate #2 served entry: OAuth with the refresh token scrubbed away. */
export function isAccessOnlyOAuth(cred: Credential | undefined): boolean {
  return cred?.type === "oauth" && !cred.refresh;
}

/**
 * Whether pi's next auth resolution would put `cred` through its refresh path
 * with nothing to refresh: an access-only entry inside pi's validity floor.
 * `expires <= 0` means no expiry was recorded (a pasted token) — there is no
 * central row to re-serve, so only the `modify` mask applies to those.
 */
export function needsServeSync(
  cred: Credential | undefined,
  now: number,
): boolean {
  if (cred?.type !== "oauth" || cred.refresh) return false;
  return cred.expires > 0 && now + PI_OAUTH_MIN_VALIDITY_MS >= cred.expires;
}

/** What pi's `modify` closures may see: never an access-only OAuth entry. */
export function maskAccessOnly(
  cred: Credential | undefined,
): Credential | undefined {
  return isAccessOnlyOAuth(cred) ? undefined : cred;
}

/** A sync standing in for serve.ts's own — tests drive the guard through it. */
let serveSyncOverride: (() => Promise<void>) | null = null;

/** Test seam: run the guard against `fn`, or `null` to restore the real sync. */
export function bindEmptyRefreshServeSync(
  fn: (() => Promise<void>) | null,
): void {
  serveSyncOverride = fn;
}

/**
 * Re-serve the expiring access-only entry, resolving serve.ts's non-throwing,
 * single-flighted sync AT THE MOMENT THE GUARD FIRES.
 *
 * Deliberately not a static import (it would cycle: serve → storage →
 * credential-store → this module) and deliberately not a binding serve.ts
 * performs at load: a binding is only in place if something imported serve.ts
 * first, so a caller that reached the store through a shorter path — importing
 * `serve-context` for `serveModeOn` rather than `serve` — silently disabled the
 * guard and let pi POST `refresh_token=""` (PRODUCT-1317). Resolved here, the
 * guard cannot be switched off by an import graph.
 *
 * Off serve mode there is nothing to re-serve — an access-only entry only ever
 * exists where the serve path wrote one — so it stays a genuine no-op there.
 */
export async function runEmptyRefreshServeSync(): Promise<void> {
  if (serveSyncOverride) {
    await serveSyncOverride();
    return;
  }
  if (!serveModeOn()) return;
  const { syncServedCredentialSafe } = await import("./serve");
  await syncServedCredentialSafe("empty-refresh-guard");
}
