export interface KeyedStorage {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

export function purgeHoustonLocalState(storage: KeyedStorage): void {
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith("houston.")) doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
}

const DEVICE_LOCAL_KEY_PREFIXES = [
  "houston.web.engine",
  "houston.web.agents",
  "houston.web.agentfile:",
  "houston.pendingAgentMoves",
  "houston.pref.push.device_id",
  "houston.pref.notifications_enabled",
  "houston.cloudMigration.outcome",
  "houston.ota.",
] as const;

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
