import { readFileSync, statSync } from "node:fs";
import { config } from "../config";
import { LruCache } from "../lru";
import type { StoredConversation } from "./conversation-file";

interface ParsedFile {
  mtimeMs: number;
  size: number;
  conv: StoredConversation;
}

interface CachedSummary<T> {
  mtimeMs: number;
  size: number;
  summary: T;
}

let cachedBytes = 0;
const parseCache = new LruCache<string, ParsedFile>({
  capacity: 64,
  onEvict: (_f, entry) => {
    cachedBytes -= entry.size;
  },
});

const summaryCache = new LruCache<string, CachedSummary<unknown>>({
  capacity: 4096,
});

function forget(f: string): void {
  const entry = parseCache.peek(f);
  if (entry) {
    parseCache.delete(f);
    cachedBytes -= entry.size;
  }
}

function remember(f: string, entry: ParsedFile): void {
  forget(f);
  const budget = config.conversationParseCacheBytes;
  if (entry.size > budget) return;
  parseCache.set(f, entry);
  cachedBytes += entry.size;
  for (const [key, old] of parseCache.entries()) {
    if (cachedBytes <= budget) break;
    if (key === f) continue;
    parseCache.delete(key);
    cachedBytes -= old.size;
  }
}

export function readParsedFile(f: string): StoredConversation | null {
  return readParsed(f)?.conv ?? null;
}

function readParsed(f: string): ParsedFile | null {
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(f);
  } catch {
    forget(f);
    summaryCache.delete(f);
    return null;
  }
  const hit = parseCache.get(f);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
  try {
    const conv = JSON.parse(readFileSync(f, "utf8")) as StoredConversation;
    const entry = { mtimeMs: st.mtimeMs, size: st.size, conv };
    remember(f, entry);
    return entry;
  } catch {
    forget(f);
    summaryCache.delete(f);
    return null;
  }
}

export function readParsedSummary<T>(
  f: string,
  derive: (conv: StoredConversation) => T,
): T | null {
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(f);
  } catch {
    forget(f);
    summaryCache.delete(f);
    return null;
  }
  const hit = summaryCache.get(f);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size)
    return hit.summary as T;
  const parsed = readParsed(f);
  if (!parsed) return null;
  const summary = derive(parsed.conv);
  summaryCache.set(f, { mtimeMs: parsed.mtimeMs, size: parsed.size, summary });
  return summary;
}

export function stampParsedFile(f: string, conv: StoredConversation): void {
  summaryCache.delete(f);
  try {
    const st = statSync(f);
    remember(f, { mtimeMs: st.mtimeMs, size: st.size, conv });
  } catch {
    forget(f);
  }
}

export function dropParsedFile(f: string): void {
  forget(f);
  summaryCache.delete(f);
}

export function parseCacheStats(): {
  entries: number;
  bytes: number;
  summaries: number;
} {
  return {
    entries: parseCache.size,
    bytes: cachedBytes,
    summaries: summaryCache.size,
  };
}
