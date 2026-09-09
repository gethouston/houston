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

/** serve.ts's non-throwing, single-flighted sync once it has loaded; tests bind their own. */
let servedSync: (() => Promise<void>) | null = null;

/**
 * How long an unbound guard waits for serve.ts before calling the runtime
 * mis-wired. Boot binds within the same module-evaluation pass as storage.ts
 * (milliseconds); a runtime still unbound after this never loaded serve.ts.
 */
export const BIND_GRACE_MS = 15_000;

/** A report deferred from a read that fired before anything was bound. */
let pendingReport: ReturnType<typeof setTimeout> | null = null;

/** Bind the served sync the guard re-serves through; `null` unbinds (tests). */
export function bindEmptyRefreshServeSync(
  fn: (() => Promise<void>) | null,
): void {
  servedSync = fn;
  if (fn && pendingReport) {
    clearTimeout(pendingReport);
    pendingReport = null;
  }
}

/**
 * Re-serve the expiring access-only entry through serve.ts's non-throwing,
 * single-flighted sync, which serve.ts BINDS here when it loads.
 *
 * Not a static import: it would cycle (serve -> storage -> credential-store ->
 * this module), and a dynamic import closes that same cycle through the one
 * module with a top-level await (`storage.ts`), which the bundler cannot
 * order. Off serve mode there is nothing to re-serve, so the guard is a
 * genuine no-op there.
 *
 * In serve mode a read can legitimately arrive BEFORE the binding: pi's boot
 * credential pass (`ModelRuntime.create` and the provider registrations that
 * follow it, inside storage.ts's top-level await) reads every provider, and
 * serve.ts depends on storage.ts, so it cannot have run yet. A recycled pod
 * whose restored auth.json holds an access-only entry inside pi's validity
 * floor lands here on every boot (PRODUCT-1743). Nothing needs re-serving on
 * that pass: the turn start syncs before the first request and the `modify`
 * mask still keeps `refresh_token=""` off the wire. So the report is deferred:
 * serve.ts binding within the grace cancels it, and only a runtime that never
 * loads serve.ts (the genuine wiring fault that would let pi POST an empty
 * refresh token, PRODUCT-1317) says so, once.
 */
export async function runEmptyRefreshServeSync(): Promise<void> {
  if (servedSync) {
    await servedSync();
    return;
  }
  if (!serveModeOn() || pendingReport) return;
  pendingReport = setTimeout(() => {
    pendingReport = null;
    if (servedSync) return;
    console.error(
      "[empty-refresh-guard] serve mode is on but no served sync is bound; serve.ts never loaded after a refresh fired",
    );
  }, BIND_GRACE_MS);
  pendingReport.unref();
}
