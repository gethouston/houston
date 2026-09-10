import { readFileSync, statSync } from "node:fs";
import { config } from "../config";
import { LruCache } from "../lru";
import type { StoredConversation } from "./conversation-file";

/**
 * Parse cache (HOU-819): every history/list read used to re-read and
 * re-JSON.parse whole conversation files on the single event loop — the list
 * route parsed EVERY file per request, re-fired by each ActivityChanged /
 * ConversationsChanged invalidation while a turn ran. Entries are validated
 * against the file's (mtimeMs, size) on every access, so writers that bypass
 * the store's `save` — the cloud store-sync hydrating `/data`, a manual
 * edit — are picked up on the next read; a hit costs a stat instead of a
 * parse.
 *
 * The cached object is the SAME reference the appenders mutate-then-save
 * (read-modify-write stays one object); a caller must never mutate a loaded
 * conversation without saving it.
 *
 * Bounded by BYTES, not only by count: a parsed transcript costs one to two
 * times its file size in heap, and a count-only bound let one runtime pin
 * sixty-four multi-MB transcripts — plus a single 165 MB routine conversation
 * — for its whole life, which was the runtime's share of an engine pod's OOM
 * kills. The budget is the sum of the cached files' on-disk sizes; a file that
 * alone exceeds it is parsed for the caller and never retained.
 */
interface ParsedFile {
  mtimeMs: number;
  size: number;
  conv: StoredConversation;
}

/** The list route's per-file digest, kept apart from the parsed transcript. */
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

/**
 * Summaries outlive the parsed transcript they were derived from: the list
 * route reads five scalars per conversation, and answering it must never
 * require re-parsing a transcript the byte budget refused to keep.
 */
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
  // Least-recent first; the entry just set is the most recent, so it survives.
  for (const [key, old] of parseCache.entries()) {
    if (cachedBytes <= budget) break;
    if (key === f) continue;
    parseCache.delete(key);
    cachedBytes -= old.size;
  }
}

/** Read + parse `f` through the cache; null on missing/unreadable (evicts). */
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

/**
 * `derive(conv)` for `f`, re-derived only when the file changed on disk. A
 * summary hit costs a stat; a miss parses once and keeps only the summary
 * when the transcript itself is over budget.
 */
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

/**
 * Stamp the cache with what `save` just wrote — the next read is a stat-hit,
 * never a re-parse of a file this process itself produced.
 */
export function stampParsedFile(f: string, conv: StoredConversation): void {
  summaryCache.delete(f);
  try {
    const st = statSync(f);
    remember(f, { mtimeMs: st.mtimeMs, size: st.size, conv });
  } catch {
    forget(f);
  }
}

/** Drop a file's cached parse (the delete path). */
export function dropParsedFile(f: string): void {
  forget(f);
  summaryCache.delete(f);
}

/** Test seam: what the caches currently hold. */
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
