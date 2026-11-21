import { actingUser } from "./acting-user.ts";
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

function storage(): CursorStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

let currentUid: string | null = null;
let currentStore: ReadCursorStore = { since: Date.now(), cursors: {} };
let resolvedOnce = false;

function syncUid(): boolean {
  const uid = actingUser()?.userId ?? null;
  if (resolvedOnce && uid === currentUid) return false;
  attachStorageListener();
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

export function getReadCursorStore(): ReadCursorStore {
  syncUid();
  return currentStore;
}

function setStore(next: ReadCursorStore): void {
  if (next === currentStore) return;
  const store = storage();
  currentStore =
    store && currentUid ? saveReadCursors(store, currentUid, next) : next;
}

export function markConversationRead(
  agentPath: string,
  conversationId: string,
  at: number = Date.now(),
): void {
  const store = getReadCursorStore();
  if (!currentUid) return;
  setStore(markRead(store, cursorKey(agentPath, conversationId), at));
}

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

function adoptStoredCursors(): void {
  const store = storage();
  if (!store || !currentUid) return;
  const merged = mergeReadCursorStores(
    currentStore,
    loadReadCursors(store, currentUid),
  );
  if (merged === currentStore) return;
  currentStore = merged;
}

function onStorageEvent(event: StorageEvent): void {
  if (
    event.key !== null &&
    (!currentUid || event.key !== readCursorStorageKey(currentUid))
  )
    return;
  adoptStoredCursors();
}

let storageListenerAttached = false;

function attachStorageListener(): void {
  if (storageListenerAttached || typeof window === "undefined") return;
  storageListenerAttached = true;
  window.addEventListener("storage", onStorageEvent);
}
