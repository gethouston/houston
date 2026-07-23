/**
 * Local conversation cache (HOU-712).
 *
 * Cloud chats live on a per-agent engine pod behind the gateway, and a cold
 * pod HOLDS `GET …/conversations/:id/messages` until it wakes — minutes in
 * the worst case — so opening a chat painted nothing until the read landed.
 * This module persists each cloud conversation's folded feed frames locally
 * (IndexedDB); `loadChatHistory` seeds the conversation VM from it instantly,
 * then the network read revalidates when it finally resolves.
 *
 * Every operation is best-effort BY DESIGN: the cache is an accelerator,
 * never a source of truth, and the network path is untouched — so a storage
 * failure logs once and degrades to exactly today's behavior instead of
 * breaking the chat (a deliberate carve-out from the no-silent-failures rule:
 * no user-initiated outcome is swallowed).
 *
 * Entries are keyed per gateway + user (the Supabase JWT `sub`), so cached
 * transcripts never leak across accounts on a shared machine; sign-out clears
 * the whole store. Local/desktop engines never cache (reads are local disk).
 */

import { createIdbBackend } from "./conversation-cache-idb";
import { trimForCache } from "./history-window";

export {
  conversationCacheScope,
  jwtSub,
} from "./conversation-cache-identity";

/** One cached feed frame — the folded `{feed_type, data}` the VM seeds from. */
export interface CachedFrame {
  feed_type: string;
  data: unknown;
  /**
   * The frame's timestamp, when the source fold carried one — preserved so a
   * cache-painted bubble keeps its real time instead of losing it (HOU-819).
   * Display metadata only: seed/replace decisions never compare timestamps
   * (live pushes and history folds are stamped by different clocks). Absent
   * on records written before this field existed.
   */
  ts?: number;
}

/** A stored transcript: its frames plus a write stamp (prune order). */
export interface CacheRecord {
  frames: CachedFrame[];
  updatedAt: number;
}

/** The storage the cache runs on — IndexedDB in the app, in-memory in tests. */
export interface ConversationCacheBackend {
  get(key: string): Promise<CacheRecord | null>;
  set(key: string, record: CacheRecord): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * Every stored key, oldest write first — the prune sweep's input. Keys
   * ONLY: the sweep runs on every write, so it must never load transcripts.
   */
  keysOldestFirst(): Promise<string[]>;
  clear(): Promise<void>;
}

/** Disk cap: keep the most recently written transcripts, evict the oldest. */
export const MAX_CACHED_CONVERSATIONS = 256;

/**
 * The current cache scope, or null when caching is off (local engine, no
 * signed-in user). Installed by the adapter's HoustonClient so the scope
 * tracks the LIVE bearer — a token refresh keeps the same `sub`, a different
 * account lands in different keys.
 */
let identity: () => string | null = () => null;

export function setConversationCacheIdentity(fn: () => string | null): void {
  identity = fn;
}

let backend: ConversationCacheBackend | null | undefined;

/** Test seam. Pass null to disable, undefined to restore the default. */
export function setConversationCacheBackend(
  b: ConversationCacheBackend | null | undefined,
): void {
  backend = b;
}

function activeBackend(): ConversationCacheBackend | null {
  if (backend === undefined) {
    backend =
      typeof indexedDB === "undefined" ? null : createIdbBackend(indexedDB);
  }
  return backend;
}

let warned = false;
function warnOnce(op: string, err: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(`[conversation-cache] ${op} failed — caching degraded:`, err);
}

function cacheKey(agentPath: string, sessionKey: string): string | null {
  const scope = identity();
  if (!scope) return null;
  return `${scope}|${encodeURIComponent(agentPath)}|${encodeURIComponent(sessionKey)}`;
}

function validFrames(value: unknown): CachedFrame[] | null {
  if (!Array.isArray(value)) return null;
  for (const f of value) {
    if (
      typeof (f as CachedFrame)?.feed_type !== "string" ||
      !("data" in (f as object))
    ) {
      return null;
    }
  }
  return value as CachedFrame[];
}

/** The locally cached transcript, or null (no cache / caching off / corrupt). */
export async function readCachedConversation(
  agentPath: string,
  sessionKey: string,
): Promise<CachedFrame[] | null> {
  const key = cacheKey(agentPath, sessionKey);
  const b = activeBackend();
  if (!key || !b) return null;
  try {
    const record = await b.get(key);
    return record ? validFrames(record.frames) : null;
  } catch (err) {
    warnOnce("read", err);
    return null;
  }
}

/** Persist a transcript (full replace), then prune past the cap. */
export async function writeCachedConversation(
  agentPath: string,
  sessionKey: string,
  frames: readonly CachedFrame[],
): Promise<void> {
  const key = cacheKey(agentPath, sessionKey);
  const b = activeBackend();
  if (!key || !b || frames.length === 0) return;
  try {
    await b.set(key, {
      // Bounded (HOU-819): the cache exists to paint a cold open instantly,
      // so it keeps a recent-window snapshot, trimmed at a TURN boundary —
      // never mid-turn, which would paint a reply missing its own prompt.
      frames: trimForCache(frames).map((f) => ({
        feed_type: f.feed_type,
        data: f.data,
        ...(f.ts !== undefined ? { ts: f.ts } : {}),
      })),
      updatedAt: Date.now(),
    });
    const keys = await b.keysOldestFirst();
    if (keys.length > MAX_CACHED_CONVERSATIONS) {
      const oldest = keys.slice(0, keys.length - MAX_CACHED_CONVERSATIONS);
      for (const k of oldest) await b.delete(k);
    }
  } catch (err) {
    warnOnce("write", err);
  }
}

/** Drop one conversation's cached transcript (server says it's gone). */
export async function deleteCachedConversation(
  agentPath: string,
  sessionKey: string,
): Promise<void> {
  const key = cacheKey(agentPath, sessionKey);
  const b = activeBackend();
  if (!key || !b) return;
  try {
    await b.delete(key);
  } catch (err) {
    warnOnce("delete", err);
  }
}

/**
 * Wipe every cached transcript — the sign-out hook, so nothing from this
 * account lingers on a shared machine. Never throws.
 */
export async function clearConversationCache(): Promise<void> {
  const b = activeBackend();
  if (!b) return;
  try {
    await b.clear();
  } catch (err) {
    warnOnce("clear", err);
  }
}
