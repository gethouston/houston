import { actingUser } from "./acting-user.ts";
import { queryClient } from "./query-client.ts";
import {
  cursorKey,
  markMentionNotified,
  markRead,
  type ReadCursorStore,
} from "./read-cursors.ts";
import { mergeReadCursorStores } from "./read-cursors-merge.ts";
import {
  type CursorStorage,
  loadReadCursors,
  pruneForeignCursorStores,
  readCursorStorageKey,
  saveReadCursors,
} from "./read-cursors-storage.ts";

/**
 * The app's ONE live read-cursor store (HOU-945): the singleton the sidebar
 * badge, the Mentions inbox and the mention notifier all read, so they can never
 * disagree about what the user has already seen.
 *
 * React-free on purpose. The rules live in the pure `read-cursors*.ts` modules;
 * this one owns the mutable instance, its persistence and its subscribers, and
 * the React bindings are a thin `useSyncExternalStore` wrapper in
 * `hooks/use-read-cursors.ts`. That split is what lets a notification callback —
 * which runs with no component mounted — read the same store the shell paints.
 *
 * **The tradeoff, deliberately taken: cursors are per-device `localStorage`, NOT
 * host preferences.** An unread badge is local reading state, and the user
 * experiences clearing it as instant. Persisting it host-side would put a
 * request on every mission open, and in hosted mode that request can be the
 * thing that WAKES a sleeping pod, which is an absurd price for a dot. The cost
 * we accept: a second device starts from its own `since` floor instead of
 * inheriting what you already read there. Nothing is lost that the user cannot
 * clear by opening the mission, which is the same gesture that cleared it on the
 * first device.
 *
 * A second TAB, unlike a second device, is not a tradeoff — it is the normal way
 * people use the web app, and both tabs write the same key. So every save merges
 * against disk and adopts the result, and a `storage` event (which fires only in
 * the OTHER tabs) folds their writes into this one live. See
 * `read-cursors-storage.ts` for why last-writer-wins was never acceptable.
 *
 * Uid changes are picked up by subscribing to the `["session"]` query in the
 * shared cache — the same raw `QueryCache.subscribe` pattern the sidebar
 * summaries use (`use-agent-activity-summaries.ts`), which attaches no query
 * observer and therefore can never trigger a fetch or wake a pod. Non-React
 * callers additionally get a lazy re-check on every read, so a notification
 * firing before any component subscribed still resolves the right user.
 */

/** `localStorage`, or null where there is none (Tauri splash window, SSR-style
 *  builds, node tests). Resolved per call so the module never touches a DOM
 *  global at import time. */
function storage(): CursorStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

let currentUid: string | null = null;
let currentStore: ReadCursorStore = { since: Date.now(), cursors: {} };
let resolvedOnce = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Re-point the singleton at the signed-in user, reloading from disk when the
 * uid changed. Returns whether it changed, so callers only notify on a real
 * swap. A signed-out user gets a fresh empty store rather than the previous
 * user's, so one account can never paint another's badges.
 *
 * A real sign-in is also the moment to evict the accounts nobody is using: it
 * is the only point where we know which uid is current, and it happens once per
 * swap rather than on every write.
 */
function syncUid(): boolean {
  const uid = actingUser()?.userId ?? null;
  if (resolvedOnce && uid === currentUid) return false;
  resolvedOnce = true;
  currentUid = uid;
  const store = storage();
  if (uid && store) {
    currentStore = loadReadCursors(store, uid);
    pruneForeignCursorStores(store, uid);
  } else {
    currentStore = { since: Date.now(), cursors: {} };
  }
  return true;
}

/** Non-React read, for callbacks (notifications) and for React's snapshot. */
export function getReadCursorStore(): ReadCursorStore {
  syncUid();
  return currentStore;
}

/**
 * Adopt a new store and persist it. The pure mutators return the SAME reference
 * when nothing changed, so the identity check here is what keeps a re-render
 * (and a `localStorage` write) off the common no-op path.
 *
 * What lands in memory is what {@link saveReadCursors} actually WROTE, not what
 * the caller passed: the write merges with whatever another tab has put on disk
 * since our last load, and keeping the pre-merge value would let this tab
 * overwrite that tab again on its next save.
 */
function setStore(next: ReadCursorStore): void {
  if (next === currentStore) return;
  const store = storage();
  currentStore =
    store && currentUid ? saveReadCursors(store, currentUid, next) : next;
  emit();
}

/** Record that a conversation was just seen. No-op when signed out. */
export function markConversationRead(
  agentPath: string,
  conversationId: string,
  at: number = Date.now(),
): void {
  const store = getReadCursorStore();
  if (!currentUid) return;
  setStore(markRead(store, cursorKey(agentPath, conversationId), at));
}

/** Record that we have already OS-pinged the user about a mention here. */
export function markConversationMentionNotified(
  agentPath: string,
  conversationId: string,
  at: number,
): void {
  const store = getReadCursorStore();
  if (!currentUid) return;
  setStore(
    markMentionNotified(store, cursorKey(agentPath, conversationId), at),
  );
}

/**
 * Fold another tab's write into this tab's live store.
 *
 * No write-back: every save merges before it writes, so disk is already a
 * superset of what either tab knows, and re-saving here would bounce a write
 * back at the tab we just heard from. The merge still runs (rather than a plain
 * replace) for two reasons: it returns the same reference when nothing new
 * arrived, which keeps a `storage` event from re-rendering the shell for
 * nothing, and it means a tab that CLEARS the origin can never delete cursors
 * out of this tab's memory — watermarks only move forward.
 */
function adoptStoredCursors(): void {
  const store = storage();
  if (!store || !currentUid) return;
  const merged = mergeReadCursorStores(
    currentStore,
    loadReadCursors(store, currentUid),
  );
  if (merged === currentStore) return;
  currentStore = merged;
  emit();
}

/** Cross-tab handler. A null `key` is a whole-origin `clear()` (a sign-out
 *  elsewhere), which goes through the same merge as any write to our key. */
function onStorageEvent(event: StorageEvent): void {
  if (
    event.key !== null &&
    (!currentUid || event.key !== readCursorStorageKey(currentUid))
  )
    return;
  adoptStoredCursors();
}

let storageListenerAttached = false;

/**
 * Subscribe to cursor movement, in `useSyncExternalStore`'s shape.
 *
 * The cross-tab listener is attached ONCE for the lifetime of the process
 * rather than per subscriber: it serves one global concern, and tying it to a
 * subscription would let the first component to unmount tear it out from under
 * every other reader.
 */
export function subscribeToReadCursors(onStoreChange: () => void): () => void {
  if (!storageListenerAttached && typeof window !== "undefined") {
    storageListenerAttached = true;
    window.addEventListener("storage", onStorageEvent);
  }
  listeners.add(onStoreChange);
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] !== "session") return;
    if (syncUid()) emit();
  });
  return () => {
    listeners.delete(onStoreChange);
    unsubscribe();
  };
}
