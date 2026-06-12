/**
 * Cloud engine state — sandbox-only, opt-in via VITE_HOUSTON_CLOUD_MODE=1.
 *
 * Owns module-scoped "we've already wired this user" flags that <CloudGate>
 * uses to avoid splash-on-tab-refocus regressions. Why module state and
 * not React refs: a useRef resets every time React remounts the component
 * (HMR, parent re-render, dev-tools tinkering). Module state survives all
 * of that — only an explicit sign-out clears it.
 *
 * Network ops live in ./cloud-engine-net.ts; cache helpers in
 * ./cloud-engine-cache.ts.
 *
 * NOT i18n-enabled — sandbox feature. Add t() before this surfaces in any
 * shipping build.
 */

import { isEngineReady, setCloudEngineConfig } from "./engine";
import { clearCache, readCache, writeCache } from "./cloud-engine-cache";
import {
  fetchTenantConfig,
  markTenantActive,
  provisionTenant,
  waitForEngineHealthy,
} from "./cloud-engine-net";

export function isCloudModeEnabled(): boolean {
  return (import.meta as any).env?.VITE_HOUSTON_CLOUD_MODE === "1";
}

let _provisionedUserId: string | null = null;
// True once <CloudGate> has rendered children at least once. After this
// point, CloudGate keeps rendering children no matter what — incidental
// auth events or React decisions can't unmount App and lose dialog state.
let _hasMountedChildren = false;

export function getProvisionedUserId(): string | null {
  return _provisionedUserId;
}

export function clearProvisioned(): void {
  _provisionedUserId = null;
  clearCache();
}

export function isProvisionedFor(userId: string): boolean {
  return _provisionedUserId === userId && isEngineReady();
}

export function markChildrenMounted(): void {
  _hasMountedChildren = true;
}

export function haveChildrenMounted(): boolean {
  return _hasMountedChildren;
}

export function resetMountedChildren(): void {
  _hasMountedChildren = false;
}

// Module-load warm-up: pull cached config out of localStorage and install
// it on the engine singleton BEFORE React mounts. This stops EngineGate
// from flashing its "Starting Houston engine" splash on page reload for
// users who've already provisioned in a previous session.
if (isCloudModeEnabled()) {
  const cached = readCache();
  if (cached) {
    setCloudEngineConfig({ baseUrl: cached.baseUrl, token: cached.token });
    _provisionedUserId = cached.userId;
  }
}

// Concurrency guard: bootstrap() and onAuthStateChange's SIGNED_IN can
// both fire ensureProvisioned in parallel for the SAME user (share the
// promise) or for DIFFERENT users (rapid logout→login). The previous
// guard collapsed both into one shared promise, which let the second
// caller "succeed" against the first caller's provisioning — engine
// config ended up wired to user A while caller B thought it had wired
// it to user B. The userId-keyed guard below routes each caller to the
// right outcome.
let _provisionInFlight: { userId: string; promise: Promise<void> } | null = null;

/**
 * Idempotent provisioning entry point used by both the CloudGate effect
 * AND the CloudLoginScreen onSignedIn callback. Guarantees:
 *  - Same userId already in flight → callers share one Promise.
 *  - Different userId already in flight → wait for the other to settle,
 *    then start fresh (no cross-tenant config leakage).
 *  - The engine singleton holds the new token BEFORE this resolves.
 *  - The localStorage cache is only written AFTER /v1/health passes —
 *    so a half-failed provision can't poison the next page reload.
 *  - On health-probe failure, _provisionedUserId is cleared so the next
 *    isProvisionedFor() doesn't trust a broken tenant.
 */
export async function ensureProvisioned(userId: string): Promise<void> {
  if (isProvisionedFor(userId)) return;
  if (_provisionInFlight) {
    if (_provisionInFlight.userId === userId) return _provisionInFlight.promise;
    // Different user — wait for the other to settle (success or fail),
    // then re-enter so this caller gets its OWN provisioning.
    await _provisionInFlight.promise.catch(() => undefined);
    return ensureProvisioned(userId);
  }

  const promise = doProvision(userId);
  _provisionInFlight = { userId, promise };
  try {
    await promise;
  } finally {
    // Only clear if we still own the lock — a different caller may have
    // already replaced it during the await chain above.
    if (_provisionInFlight?.promise === promise) _provisionInFlight = null;
  }
}

async function doProvision(userId: string): Promise<void> {
  const prev = getProvisionedUserId();
  if (prev && prev !== userId) {
    clearProvisioned();
    resetMountedChildren();
  }

  let config = await fetchTenantConfig();
  if (!config) {
    await provisionTenant();
    config = await fetchTenantConfig();
  }
  if (!config) {
    throw new Error(
      "provision-tenant returned but no ready row appeared in `tenants`",
    );
  }
  // Wire engine + module state so other code paths see "ready", but
  // delay cache persistence until we know /v1/health actually answers.
  setCloudEngineConfig(config);
  _provisionedUserId = userId;
  try {
    // Tell the local PF watcher which tenant we want on :7777. The
    // watcher polls Supabase by `updated_at desc`, so bumping it elects
    // this tenant ahead of the next watcher tick (≤5s). Done before
    // the health probe so its retry budget covers the PF flip.
    await markTenantActive();
    await waitForEngineHealthy(config);
  } catch (err) {
    // Engine isn't actually reachable — don't leave _provisionedUserId
    // pointing at a tenant the next isProvisionedFor() call will trust.
    if (_provisionedUserId === userId) _provisionedUserId = null;
    throw err;
  }
  // Health confirmed — safe to commit to cache for next page load.
  writeCache({ userId, baseUrl: config.baseUrl, token: config.token });
}
