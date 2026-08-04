// Dependency-free on purpose: `app/tests` imports this under node:test, where
// the Tauri/web import chains of the account-deletion flow cannot load.

/** The narrow slice of the Web Storage API the purge walks. */
export interface KeyedStorage {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/** Remove every `houston.*` key (sidebar layout, read cursors, agent colors,
 *  migration outcome, onboarding mirrors) from the given storage. Used by the
 *  account-deletion teardown (HOU-991) — plain sign-out deliberately leaves
 *  these so a returning user finds their world intact. Snapshot the keys
 *  first: removal renumbers the indices mid-walk. */
export function purgeHoustonLocalState(storage: KeyedStorage): void {
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith("houston.")) doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
}
