// Dependency-free on purpose: `app/tests` imports this under node:test, where
// the Tauri/web import chains of the account-deletion flow cannot load.

/** The narrow slice of the Web Storage API the purge walks. */
export interface KeyedStorage {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/** Remove every `houston.*` key (sidebar layout, read cursors, agent colors,
 *  migration outcome, onboarding mirrors — AND the device-level keys below)
 *  from the given storage. Used by the account-deletion teardown (HOU-991),
 *  which erases this device's whole Houston footprint. Plain sign-out uses the
 *  narrower `purgeAccountLocalState`. Snapshot the keys first: removal
 *  renumbers the indices mid-walk. */
export function purgeHoustonLocalState(storage: KeyedStorage): void {
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith("houston.")) doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
}

/**
 * `houston.*` key prefixes that belong to the DEVICE (or to browser-local data
 * that is nobody's hosted account), not to the signed-in account, so sign-out
 * must keep them:
 *
 *  - `houston.web.engine` (+ its `.new` successor) — which host this browser
 *    connects to (self-host URL). Signing out of an account must not make the
 *    browser forget its engine.
 *  - `houston.web.agents` / `houston.web.agentfile:` — the standalone
 *    (no-host) adapter's local agent store: the browser analog of the
 *    `~/.houston` tree, which sign-out never wipes (HOU-991).
 */
const DEVICE_LOCAL_KEY_PREFIXES = [
  "houston.web.engine",
  "houston.web.agents",
  "houston.web.agentfile:",
] as const;

/** Remove every ACCOUNT-scoped `houston.*` key — prefs mirrors, sidebar
 *  layouts, read cursors, agent colors, onboarding mirrors, provider-status
 *  caches, the last-sign-in hint — while keeping the device-level keys above.
 *  Runs on every sign-out (PRODUCT-1235): no trace of the outgoing account may
 *  survive into the next sign-in. */
export function purgeAccountLocalState(storage: KeyedStorage): void {
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith("houston.")) continue;
    if (DEVICE_LOCAL_KEY_PREFIXES.some((p) => key.startsWith(p))) continue;
    doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
}
