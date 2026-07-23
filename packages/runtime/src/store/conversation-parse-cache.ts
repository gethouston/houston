import { readFileSync, statSync } from "node:fs";
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
 * conversation without saving it. Bounded: parsed transcripts can be MBs.
 */
interface ParsedFile {
  mtimeMs: number;
  size: number;
  conv: StoredConversation;
}

const parseCache = new LruCache<string, ParsedFile>({ capacity: 64 });

/** Read + parse `f` through the cache; null on missing/unreadable (evicts). */
export function readParsedFile(f: string): StoredConversation | null {
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(f);
  } catch {
    parseCache.delete(f);
    return null;
  }
  const hit = parseCache.get(f);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size)
    return hit.conv;
  try {
    const conv = JSON.parse(readFileSync(f, "utf8")) as StoredConversation;
    parseCache.set(f, { mtimeMs: st.mtimeMs, size: st.size, conv });
    return conv;
  } catch {
    parseCache.delete(f);
    return null;
  }
}

/**
 * Stamp the cache with what `save` just wrote — the next read is a stat-hit,
 * never a re-parse of a file this process itself produced.
 */
export function stampParsedFile(f: string, conv: StoredConversation): void {
  try {
    const st = statSync(f);
    parseCache.set(f, { mtimeMs: st.mtimeMs, size: st.size, conv });
  } catch {
    parseCache.delete(f);
  }
}

/** Drop a file's cached parse (the delete path). */
export function dropParsedFile(f: string): void {
  parseCache.delete(f);
}
