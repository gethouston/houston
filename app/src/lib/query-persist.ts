/**
 * Persist the pod-held list queries to disk (follow-up to HOU-712).
 *
 * PR #748 cached open TRANSCRIPTS locally; this covers the rest of the blank
 * surface: the sidebar conversation lists and board activities are TanStack
 * queries backed by an agent's engine pod, and the gateway holds those reads
 * for the whole pod cold start — so the board/sidebar rendered empty until
 * the pod woke. `persistQueryClient` restores the whitelisted queries from
 * IndexedDB at boot as STALE data (they paint instantly), and the normal
 * refetch revalidates whenever the pod answers; failures keep today's query
 * error surfacing.
 *
 * Cloud-only, per-user: the persist `buster` is the same gateway+user scope
 * the transcript cache uses, so a different account (or a non-JWT local host
 * token) never restores another user's lists — no identity, no persistence.
 * Sign-out wipes the store (see auth.ts).
 */

import {
  clearConversationCache,
  conversationCacheScope,
} from "@houston-ai/engine-client";
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

/** Minimal AsyncStorage over IndexedDB — the persister's byte store. */
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

/**
 * The persistence scope: the same gateway+user identity the transcript cache
 * keys on. Null (local sidecar's random token, static hosts, tests, no
 * engine) disables persistence entirely.
 */
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

/**
 * Build the provider options after EngineGate has established the hosted user.
 * The provider owns restore ordering: observers may mount, but their fetches
 * stay paused until hydration finishes. Cached lists can paint before a cold
 * pod read, and fresh results cannot be missed before persistence subscribes.
 * No cloud identity means no persistence.
 */
export function queryPersistenceOptions(
  queryClient: QueryClient,
): QueryPersistenceOptions | null {
  const scope = queryPersistScope();
  if (!scope || typeof indexedDB === "undefined") return null;
  // Restored-but-not-yet-observed queries must outlive the in-memory GC for
  // as long as they are restorable, or the persist mirror drops them from
  // disk before the user revisits that agent (see query-persist-policy.ts).
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

/**
 * Wipe every locally persisted server copy — the sign-out hook: the list
 * queries here plus the conversation transcript cache (HOU-712). Never
 * throws; sign-out must not be blockable by a broken cache.
 */
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
