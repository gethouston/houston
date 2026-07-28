import type { ReadCursorStore } from "./read-cursors.ts";
import { mergeReadCursorStores } from "./read-cursors-merge.ts";
import {
  parseLastTouched,
  parseReadCursorStore,
  READ_CURSOR_SCHEMA_VERSION,
} from "./read-cursors-parse.ts";

/**
 * Where a user's read cursors live on this device, and the two rules that make
 * ONE shared browser origin safe for them (HOU-945).
 *
 * Cursors live in ONE JSON blob per signed-in user ({@link
 * readCursorStorageKey}) so two accounts on the same machine can never read
 * each other's cursors, and so a sign-out cannot leave a half-migrated pile of
 * per-conversation keys behind. That single-blob shape is what forces both
 * rules here:
 *
 * 1. **Every write MERGES** ({@link saveReadCursors}) against whatever is on
 *    disk at that instant. A second tab is not a rare case — it is the normal
 *    way people use the web app — and a whole-blob overwrite would silently
 *    erase the missions the other tab had already cleared.
 * 2. **Foreign accounts are EVICTED** ({@link pruneForeignCursorStores}).
 *    Nothing ever removed a signed-out account's blob, so a shared or
 *    demo machine accreted one uncapped store per person who ever signed in,
 *    against a ~5MB origin quota this app already shares with the query
 *    persister.
 *
 * Storage is INJECTED ({@link CursorStorage}) rather than reached for as a
 * global. That keeps the module importable under plain node with no DOM, so
 * every rule here is unit-tested, and it means the module never touches
 * `localStorage` at import time (which would throw in the Tauri splash window
 * and in SSR-style builds).
 */

/**
 * Minimal storage seam (`localStorage` in the app, a Map in tests). It is
 * ENUMERABLE (`length` / `key`) because the foreign-account sweep has to
 * discover blobs belonging to uids this session has never heard of.
 */
export interface CursorStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  readonly length: number;
  key(index: number): string | null;
}

/** Shared by every account's blob, so the sweep can recognize its own family
 *  of keys without touching anything else in the origin. */
const KEY_PREFIX = "houston.read-cursors.";

/**
 * How many OTHER accounts' cursor blobs this device keeps.
 *
 * Small on purpose. The value of a signed-out account's cursors is "if you sign
 * back in, your badges are where you left them", which is worth a few hundred
 * bytes for the handful of accounts a person actually switches between and
 * worth nothing for the long tail of one-off sign-ins on a shared machine.
 * Losing an evicted account's blob costs it only its read floor: the store is
 * recreated at the moment of the next sign-in, so nothing old appears unread.
 */
const MAX_FOREIGN_STORES = 4;

/** localStorage key for one user. Per-uid so two accounts on one machine never
 *  read each other's cursors. */
export function readCursorStorageKey(uid: string): string {
  return `${KEY_PREFIX}${uid}`;
}

/**
 * Load (or create) a user's store. A corrupt or foreign payload is replaced
 * with a fresh store rather than throwing — see `read-cursors-parse.ts` for why
 * that silent recovery is the right call here.
 */
export function loadReadCursors(
  storage: CursorStorage,
  uid: string,
  now: number = Date.now(),
): ReadCursorStore {
  return parseReadCursorStore(storage.getItem(readCursorStorageKey(uid)), now);
}

/**
 * Persist a store, MERGED over whatever is on disk at this instant, and answer
 * what was actually written.
 *
 * The read-modify-write is the point: between this tab's last load and this
 * save, another tab may have cleared missions of its own. Callers must adopt
 * the returned store rather than keeping the one they passed in, otherwise this
 * tab's memory and the disk disagree until the next reload — and the badge the
 * other tab cleared would come back on the next write from here.
 */
export function saveReadCursors(
  storage: CursorStorage,
  uid: string,
  store: ReadCursorStore,
  now: number = Date.now(),
): ReadCursorStore {
  const key = readCursorStorageKey(uid);
  // Fall back to THIS store's own floor, so a first-ever write merges with an
  // absent blob without inventing an earlier `since` out of the clock.
  const stored = parseReadCursorStore(storage.getItem(key), store.since);
  const merged = mergeReadCursorStores(store, stored);
  storage.setItem(
    key,
    JSON.stringify({
      version: READ_CURSOR_SCHEMA_VERSION,
      since: merged.since,
      // Stamped on every write and read only by the sweep below: it is how one
      // account's blob answers "is anybody still using me?".
      lastTouched: now,
      cursors: merged.cursors,
    }),
  );
  return merged;
}

/**
 * Evict the read-cursor blobs of accounts other than `uid`, keeping the
 * {@link MAX_FOREIGN_STORES} most recently written.
 *
 * The signed-in user's own blob is never a candidate, whatever its stamp says.
 * Ties break on the key so the surviving set is deterministic, and every
 * candidate is collected BEFORE anything is removed, because the seam's index
 * shifts under a delete.
 */
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
