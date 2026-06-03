import type { HighlightRange } from "@houston-ai/core";

/** A matched fragment shown below a mission in search results. `text` is the
 *  display string; `ranges` index into it for `<HighlightedText>`. */
export interface MissionSnippet {
  text: string;
  ranges: HighlightRange[];
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Fold one character for accent/case-insensitive matching. May yield 0 chars
 *  (a lone combining mark) or >1 (an expanded ligature). */
function foldChar(char: string): string {
  return char.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase();
}

/** Fold `text` for matching while recording, for each folded char, the index of
 *  the original char it came from. `map[folded.length] === text.length`, so an
 *  exclusive end position always resolves. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = foldChar(text[i]);
    for (let j = 0; j < f.length; j++) {
      folded += f[j];
      map.push(i);
    }
  }
  map.push(text.length);
  return { folded, map };
}

/** Fold a whole string for matching (case-folded, accents stripped). Shared by
 *  the search filter so matching and highlighting always agree. */
export function foldForSearch(value: string): string {
  return foldWithMap(value).folded;
}

/**
 * Find every occurrence of any `term` in `text`, returned as ranges into the
 * ORIGINAL text. `terms` must already be folded (lowercase, accents stripped) —
 * the search layer produces them that way. Sorted, with overlaps merged.
 */
export function findHighlightRanges(text: string, terms: string[]): HighlightRange[] {
  const cleanTerms = terms.filter(Boolean);
  if (!text || cleanTerms.length === 0) return [];

  const { folded, map } = foldWithMap(text);
  const ranges: HighlightRange[] = [];
  for (const term of cleanTerms) {
    let from = folded.indexOf(term);
    while (from !== -1) {
      const start = map[from];
      // `start + 1` guards against a zero-width hit inside an expanded ligature.
      const end = Math.max(map[from + term.length], start + 1);
      ranges.push({ start, end });
      from = folded.indexOf(term, from + term.length);
    }
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: HighlightRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push(r);
  }
  return merged;
}

export interface ExtractSnippetOptions {
  /** Characters of context to keep on each side of the first match. */
  radius?: number;
}

/**
 * Build a short fragment of `text` centered on the first matched term, with
 * ellipses where it was clipped. This is the "why did this match" snippet shown
 * below a mission whose match is in its body, not its title. Returns null when
 * no term occurs in `text`. The returned `ranges` index into the
 * (whitespace-collapsed) snippet `text`.
 */
export function extractSnippet(
  text: string,
  terms: string[],
  options: ExtractSnippetOptions = {},
): MissionSnippet | null {
  const radius = options.radius ?? 48;
  const matches = findHighlightRanges(text, terms);
  if (matches.length === 0) return null;

  const first = matches[0];
  const windowStart = Math.max(0, first.start - radius);
  const windowEnd = Math.min(text.length, first.end + radius);

  const prefix = windowStart > 0 ? "…" : "";
  const suffix = windowEnd < text.length ? "…" : "";
  const slice = text.slice(windowStart, windowEnd).replace(/\s+/g, " ").trim();
  if (!slice) return null;

  const snippet = `${prefix}${slice}${suffix}`;
  // Re-find ranges against the final display string: collapsing whitespace and
  // adding ellipses shifts indices, so recompute against what we actually show.
  return { text: snippet, ranges: findHighlightRanges(snippet, terms) };
}
