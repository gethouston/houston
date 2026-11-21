import type { ReadCursorStore } from "./read-cursors.ts";
import { mergeReadCursorStores } from "./read-cursors-merge.ts";
import {
  parseLastTouched,
  parseReadCursorStore,
  READ_CURSOR_SCHEMA_VERSION,
} from "./read-cursors-parse.ts";

export interface CursorStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  readonly length: number;
  key(index: number): string | null;
}

const KEY_PREFIX = "houston.read-cursors.";

const MAX_FOREIGN_STORES = 4;

export function readCursorStorageKey(uid: string): string {
  return `${KEY_PREFIX}${uid}`;
}

export function loadReadCursors(
  storage: CursorStorage,
  uid: string,
  now: number = Date.now(),
): ReadCursorStore {
  return parseReadCursorStore(storage.getItem(readCursorStorageKey(uid)), now);
}

export function saveReadCursors(
  storage: CursorStorage,
  uid: string,
  store: ReadCursorStore,
  now: number = Date.now(),
): ReadCursorStore {
  const key = readCursorStorageKey(uid);
  const stored = parseReadCursorStore(storage.getItem(key), store.since);
  const merged = mergeReadCursorStores(store, stored);
  storage.setItem(
    key,
    JSON.stringify({
      version: READ_CURSOR_SCHEMA_VERSION,
      since: merged.since,
      lastTouched: now,
      cursors: merged.cursors,
    }),
  );
  return merged;
}

export function pruneForeignCursorStores(
  storage: CursorStorage,
  uid: string,
): void {
  const mine = readCursorStorageKey(uid);
  const foreign: { key: string; lastTouched: number }[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === null || key === mine || !key.startsWith(KEY_PREFIX)) continue;
    foreign.push({ key, lastTouched: parseLastTouched(storage.getItem(key)) });
  }
  if (foreign.length <= MAX_FOREIGN_STORES) return;
  foreign.sort(
    (a, b) => b.lastTouched - a.lastTouched || a.key.localeCompare(b.key),
  );
  for (const stale of foreign.slice(MAX_FOREIGN_STORES)) {
    storage.removeItem(stale.key);
  }
}
