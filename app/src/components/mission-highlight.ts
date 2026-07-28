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

/**
 * Fold `text` for matching while recording, for each folded char, the index of
 * the original char it came from. `map[folded.length] === text.length`, so an
 * exclusive end position always resolves.
 *
 * This walks the string CHARACTER BY CHARACTER, so it is ~100x slower than
 * {@link foldForSearch} \u2014 it exists only because highlighting needs the
 * folded->original index map. Give it SHORT text (a title, one chat message,
 * a snippet); never a whole transcript (HOU-941).
 *
 * Per-character folding agrees with the whole-string fold everywhere except
 * one Unicode corner: a word-final Greek sigma only lowercases to `\u03c2` when the
 * engine can see the whole word. A phrase landing on that corner still matches
 * (both sides of a match are whole-string folded) but gets no highlight.
 */
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

/**
 * Fold a whole string for matching (case-folded, accents stripped). Shared by
 * the search filter so matching and highlighting always agree.
 *
 * ONE pass through the engine's native `normalize`/`replace`/`toLowerCase`.
 * This used to delegate to {@link foldWithMap}'s per-character walk, which made
 * folding a mission's transcript the dominant cost of a board search (HOU-941).
 */
export function foldForSearch(value: string): string {
  return value.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase();
}

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Build a regex source matching the folded `phrase` as a CONTIGUOUS phrase, with
 * any run of whitespace between words flexible (so "this month" also matches
 * "this\nmonth"). Returns "" when the phrase has no words.
 */
function phrasePattern(phrase: string): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((word) => word.replace(REGEXP_SPECIALS, "\\$&"))
    .join("\\s+");
}

/**
 * Where `phrase` first occurs in ALREADY-FOLDED text, as `[start, end)` folded
 * indices — or null. The hot path for scanned transcripts: they are folded once
 * when they load, so a keystroke only re-runs this regex over them (HOU-941).
 * `phrase` must already be folded.
 */
export function findFoldedMatch(
  folded: string,
  phrase: string,
): { start: number; end: number } | null {
  const pattern = phrasePattern(phrase);
  if (!folded || !pattern) return null;
  const match = new RegExp(pattern).exec(folded);
  if (!match || match[0].length === 0) return null;
  return { start: match.index, end: match.index + match[0].length };
}

/**
 * Whether `text` contains `phrase` (case- and accent-insensitive, whitespace
 * between words flexible). `phrase` must already be folded. Folds `text` on
 * every call — for SHORT text (a title, a description). Text that is matched
 * repeatedly (a transcript) should be pre-folded and matched with
 * {@link findFoldedMatch} instead.
 */
export function matchesPhrase(
  text: string | undefined,
  phrase: string,
): boolean {
  if (!text) return false;
  return findFoldedMatch(foldForSearch(text), phrase) !== null;
}

/**
 * Ranges (into the ORIGINAL `text`) of every occurrence of `phrase`. `phrase`
 * must already be folded; a multi-word phrase matches contiguously (flexible
 * whitespace), never as scattered words. Sorted, with overlaps merged.
 *
 * Uses {@link foldWithMap}, so `text` must be SHORT — a title, one chat
 * message, an already-cut snippet. Callers that hold a whole transcript locate
 * the matching message first (see `mission-search-text.ts`).
 */
export function findHighlightRanges(
  text: string,
  phrase: string,
): HighlightRange[] {
  const pattern = phrasePattern(phrase);
  if (!text || !pattern) return [];

  const { folded, map } = foldWithMap(text);
  const re = new RegExp(pattern, "g");
  const ranges: HighlightRange[] = [];
  for (let match = re.exec(folded); match !== null; match = re.exec(folded)) {
    if (match[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    const start = map[match.index];
    // `start + 1` guards against a zero-width hit inside an expanded ligature.
    const end = Math.max(map[match.index + match[0].length], start + 1);
    ranges.push({ start, end });
  }

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
 * Build a short fragment of `text` centered on the first match of `phrase`, with
 * ellipses where it was clipped. This is the "why did this match" snippet shown
 * below a mission whose match is in its body, not its title. Returns null when
 * the phrase does not occur in `text`. The returned `ranges` index into the
 * (whitespace-collapsed) snippet `text`.
 */
export function extractSnippet(
  text: string,
  phrase: string,
  options: ExtractSnippetOptions = {},
): MissionSnippet | null {
  const radius = options.radius ?? 48;
  const matches = findHighlightRanges(text, phrase);
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
  return { text: snippet, ranges: findHighlightRanges(snippet, phrase) };
}
