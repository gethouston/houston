import type {
  CacheRecord,
  ConversationCacheBackend,
} from "./conversation-cache-types";

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
      const keys = await req(s.index(BY_UPDATED_AT).getAllKeys());
      return keys.map(String);
    },
    async clear() {
      const s = await store("readwrite");
      await req(s.clear());
    },
  };
}
