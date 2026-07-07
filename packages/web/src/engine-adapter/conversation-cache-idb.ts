/**
 * IndexedDB backend for the local conversation cache (HOU-712).
 *
 * Transcripts are too big for localStorage (a busy conversation folds to
 * hundreds of KB), so the cache lives in IndexedDB: one object store, records
 * `{k, frames, updatedAt}` keyed on `k` (the cache module's scoped key) with
 * an `updatedAt` index so the prune sweep reads KEYS ONLY — it runs on every
 * write and must never load transcripts. Plumbing only — validation, scoping,
 * and prune policy live in conversation-cache.ts.
 */

import type {
  CacheRecord,
  ConversationCacheBackend,
} from "./conversation-cache";

const DB_NAME = "houston-conversation-cache";
const DB_VERSION = 1;
const STORE = "conversations";
const BY_UPDATED_AT = "updatedAt";

type StoredRecord = CacheRecord & { k: string };

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function createIdbBackend(idb: IDBFactory): ConversationCacheBackend {
  // One connection per session, opened lazily; dropped on close/error so the
  // next operation reopens instead of failing forever.
  let dbPromise: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const openReq = idb.open(DB_NAME, DB_VERSION);
        openReq.onupgradeneeded = () => {
          const db = openReq.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: "k" });
            store.createIndex(BY_UPDATED_AT, "updatedAt");
          }
        };
        openReq.onsuccess = () => {
          const db = openReq.result;
          db.onclose = () => {
            dbPromise = null;
          };
          resolve(db);
        };
        openReq.onerror = () => {
          dbPromise = null;
          reject(openReq.error);
        };
      });
    }
    return dbPromise;
  }

  async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await open();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  return {
    async get(key) {
      const s = await store("readonly");
      const value = (await req(s.get(key))) as StoredRecord | undefined;
      return value
        ? { frames: value.frames, updatedAt: value.updatedAt }
        : null;
    },
    async set(key, record) {
      const s = await store("readwrite");
      await req(s.put({ ...record, k: key } satisfies StoredRecord));
    },
    async delete(key) {
      const s = await store("readwrite");
      await req(s.delete(key));
    },
    async keysOldestFirst() {
      const s = await store("readonly");
      // The index orders by updatedAt ascending; getAllKeys returns the
      // records' PRIMARY keys in that order, loading no values.
      const keys = await req(s.index(BY_UPDATED_AT).getAllKeys());
      return keys.map(String);
    },
    async clear() {
      const s = await store("readwrite");
      await req(s.clear());
    },
  };
}
