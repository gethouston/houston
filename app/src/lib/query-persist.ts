import {
  clearConversationCache,
  conversationCacheScope,
} from "@houston/engine-adapter";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { QueryClient } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { logger } from "./logger";
import {
  isPersistedQueryKey,
  PERSIST_MAX_AGE_MS,
  PERSISTED_QUERY_PREFIXES,
} from "./query-persist-policy";

const DB_NAME = "houston-query-cache";
const STORE = "kv";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function kvStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) {
        open.result.createObjectStore(STORE);
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return db.transaction(STORE, mode).objectStore(STORE);
}

const idbStorage = {
  getItem: async (key: string) =>
    ((await req((await kvStore("readonly")).get(key))) as string | undefined) ??
    null,
  setItem: async (key: string, value: string) => {
    await req((await kvStore("readwrite")).put(value, key));
  },
  removeItem: async (key: string) => {
    await req((await kvStore("readwrite")).delete(key));
  },
};

const PERSIST_KEY = "houston.list-queries";

function queryPersistScope(): string | null {
  const engine =
    typeof window !== "undefined" ? window.__HOUSTON_ENGINE__ : undefined;
  if (!engine) return null;
  return conversationCacheScope(engine.baseUrl, engine.token);
}

export type QueryPersistenceOptions = Omit<
  PersistQueryClientOptions,
  "queryClient"
>;

export function queryPersistenceOptions(
  queryClient: QueryClient,
): QueryPersistenceOptions | null {
  const scope = queryPersistScope();
  if (!scope || typeof indexedDB === "undefined") return null;
  for (const prefix of PERSISTED_QUERY_PREFIXES) {
    queryClient.setQueryDefaults([prefix], { gcTime: PERSIST_MAX_AGE_MS });
  }
  return {
    persister: createAsyncStoragePersister({
      storage: idbStorage,
      key: PERSIST_KEY,
    }),
    maxAge: PERSIST_MAX_AGE_MS,
    buster: scope,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.state.status === "success" && isPersistedQueryKey(query.queryKey),
    },
  };
}

export async function clearPersistedLocalData(): Promise<void> {
  await clearConversationCache();
  try {
    if (typeof indexedDB !== "undefined") {
      await idbStorage.removeItem(PERSIST_KEY);
    }
  } catch (err) {
    logger.warn(`[query-persist] clear failed: ${err}`);
  }
}
