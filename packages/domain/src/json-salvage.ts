/**
 * Salvage for `.houston` JSON docs that fail `JSON.parse` without the user
 * having lost anything: a complete value followed by trailing bytes. Seen in
 * the wild as `routines.json` = the full array + a second partial copy of it
 * (an outside writer appended/overlapped; the host's own writes are atomic).
 * The Rust engine kept the first value in that case; the TS cutover dropped
 * it, so one mangled file 500'd `list_routines` on every poll and bricked
 * the Routines tab for that agent. Only a prefix that parses on its own is
 * salvaged; anything else still surfaces as the caller's "not valid JSON"
 * throw, because a lossy reset would destroy the user's data on next write.
 */

/**
 * Index just past the first complete top-level object/array in `text`, or
 * -1 when the text does not start with one or it never closes. Scalars are
 * not salvaged: a scalar doc is never a `.houston` data file.
 */
export function firstJsonValueEnd(text: string): number {
  let i = 0;
  while (i < text.length && isJsonWhitespace(text[i])) i++;
  const open = text[i];
  if (open !== "{" && open !== "[") return -1;
  let depth = 0;
  let inString = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Parse the leading complete value of a doc that has trailing junk after it.
 * Returns `undefined` when there is nothing to salvage (no complete leading
 * value, or the prefix itself is not valid JSON): the caller keeps its throw.
 */
export function salvageLeadingJson(text: string): unknown {
  const end = firstJsonValueEnd(text);
  if (end < 0 || end >= text.length) return undefined;
  if (text.slice(end).trim() === "") return undefined;
  try {
    return JSON.parse(text.slice(0, end)) as unknown;
  } catch {
    // Mangled inside the leading value, not just after it: not ours to guess.
    return undefined;
  }
}

function isJsonWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
}
