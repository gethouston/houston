import { createIdbBackend } from "./conversation-cache-idb";
import type {
  CachedFrame,
  ConversationCacheBackend,
} from "./conversation-cache-types";
import { trimForCache } from "./history-window";

export {
  conversationCacheScope,
  jwtSub,
} from "./conversation-cache-identity";
export type {
  CachedFrame,
  CacheRecord,
  ConversationCacheBackend,
} from "./conversation-cache-types";

export const MAX_CACHED_CONVERSATIONS = 256;

let identity: () => string | null = () => null;

export function setConversationCacheIdentity(fn: () => string | null): void {
  identity = fn;
}

let backend: ConversationCacheBackend | null | undefined;

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
      frames: trimForCache(frames).map((f) => ({
        feed_type: f.feed_type,
        data: f.data,
        ...(f.ts !== undefined ? { ts: f.ts } : {}),
        ...(f.author !== undefined ? { author: f.author } : {}),
        ...(f.mentions !== undefined ? { mentions: f.mentions } : {}),
        ...(f.turnId !== undefined ? { turnId: f.turnId } : {}),
        ...(f.toolIndex !== undefined ? { toolIndex: f.toolIndex } : {}),
        ...(f.notice !== undefined ? { notice: f.notice } : {}),
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

export async function clearConversationCache(): Promise<void> {
  const b = activeBackend();
  if (!b) return;
  try {
    await b.clear();
  } catch (err) {
    warnOnce("clear", err);
  }
}
