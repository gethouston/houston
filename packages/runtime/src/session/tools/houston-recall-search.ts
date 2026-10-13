import { isArchivedLearning, type Learning } from "@houston/protocol";
import { loadAgentLearnings } from "../learnings-context";

/** Characters of surrounding text kept on EACH side of a match. */
const CONTEXT_CHARS = 300;

/**
 * Per-hit and whole-result caps, mirroring read_mission's magnitudes. The
 * per-hit cap is not implied by CONTEXT_CHARS: an excerpt also contains the
 * matched text itself, and the MODEL chooses the query, so a pathologically
 * long one is bounded here rather than passed through.
 */
export const MAX_HIT_CHARS = 1_500;
export const MAX_TOTAL_CHARS = 24_000;

/**
 * A stored message's time as ISO. Messages written before the store stamped
 * `ts` carry none, and "Invalid Date" would read to the model as a real answer.
 */
export function timestampOf(ts: number | undefined): string {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) {
    return "time unknown";
  }
  return new Date(ts).toISOString();
}

/** The matched text plus its surroundings, ellipsised where it was cut. */
export function excerptAround(
  content: string,
  at: number,
  matchLength: number,
) {
  const start = Math.max(0, at - CONTEXT_CHARS);
  const end = Math.min(content.length, at + matchLength + CONTEXT_CHARS);
  const body = content.slice(start, end).trim();
  const clipped =
    body.length > MAX_HIT_CHARS
      ? `${body.slice(0, MAX_HIT_CHARS)} [...]`
      : body;
  const head = start > 0 ? "[...] " : "";
  const tail = end < content.length ? " [...]" : "";
  return `${head}${clipped}${tail}`;
}

/**
 * The memory half of `houston_recall`: the agent's saved memories matching
 * the query, archived ones included. Consolidation archives instead of
 * deleting precisely so a detail folded out of the active list (an old
 * address, a past preference) can still be found here.
 */
export interface MemoryHits {
  lines: string[];
  matched: number;
  /** Characters the lines spent, so the transcript fills what is left. */
  spent: number;
}

/** Memories get at most half the result, so transcript hits always fit too. */
const MEMORY_BUDGET = MAX_TOTAL_CHARS / 2;

/** Newest first: a memory is appended to the end of its file. */
export function searchMemories(
  workspaceDir: string,
  needle: string,
  limit: number,
): MemoryHits {
  const all = loadAgentLearnings(workspaceDir);
  const byId = new Map(all.map((item) => [item.id, item]));
  const hits: MemoryHits = { lines: [], matched: 0, spent: 0 };
  for (const learning of [...all].reverse()) {
    if (!learning.text.toLowerCase().includes(needle)) continue;
    hits.matched += 1;
    if (hits.lines.length >= limit) continue;
    const line = memoryLine(learning, byId, MAX_HIT_CHARS);
    if (hits.spent + line.length > MEMORY_BUDGET) continue;
    hits.spent += line.length;
    hits.lines.push(line);
  }
  return hits;
}

function memoryLine(
  learning: Learning,
  byId: ReadonlyMap<string, Learning>,
  maxChars: number,
): string {
  const text = clip(learning.text.trim(), maxChars);
  if (!isArchivedLearning(learning)) return `- [current memory] ${text}`;
  const replacement = learning.replaced_by
    ? byId.get(learning.replaced_by)
    : undefined;
  const since = `archived ${learning.archived_at}`;
  return replacement
    ? `- [${since}, replaced by: "${clip(replacement.text.trim(), maxChars)}"] ${text}`
    : `- [${since}] ${text}`;
}

function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)} [...]` : text;
}
