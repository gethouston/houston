import type { HighlightRange } from "@houston-ai/core";

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/** Same folding semantics as archived mission search: ignore case and accents. */
export function foldConversationSearch(value: string): string {
  return value.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase();
}

/** Fold, collapse whitespace, and trim a raw conversation search query. */
export function normalizeConversationSearchQuery(value: string): string {
  return foldConversationSearch(value).replace(/\s+/g, " ").trim();
}

function phrasePattern(phrase: string): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((word) => word.replace(REGEXP_SPECIALS, "\\$&"))
    .join("\\s+");
}

function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const fragment = foldConversationSearch(text[index]);
    for (const char of fragment) {
      folded += char;
      map.push(index);
    }
  }
  map.push(text.length);
  return { folded, map };
}

/** Whether `text` contains the already-normalized search phrase. */
export function matchesConversationSearch(
  text: string,
  phrase: string,
): boolean {
  const pattern = phrasePattern(phrase);
  if (!text || !pattern) return false;
  return new RegExp(pattern).test(foldConversationSearch(text));
}

/** A compact excerpt centered on the first search match. */
export function conversationSearchSnippet(
  text: string,
  phrase: string,
  radius = 48,
): string | null {
  const pattern = phrasePattern(phrase);
  if (!text || !pattern) return null;

  const { folded, map } = foldWithMap(text);
  const match = new RegExp(pattern).exec(folded);
  if (!match || match[0].length === 0) return null;
  const start = map[match.index];
  const end = Math.max(map[match.index + match[0].length], start + 1);
  const windowStart = Math.max(0, start - radius);
  const windowEnd = Math.min(text.length, end + radius);
  const prefix = windowStart > 0 ? "…" : "";
  const suffix = windowEnd < text.length ? "…" : "";
  const excerpt = text
    .slice(windowStart, windowEnd)
    .replace(/\s+/g, " ")
    .trim();
  return excerpt ? `${prefix}${excerpt}${suffix}` : null;
}

/** Original-text ranges for the matching phrase, suitable for HighlightedText. */
export function conversationSearchRanges(
  text: string,
  phrase: string,
): HighlightRange[] {
  const pattern = phrasePattern(phrase);
  if (!text || !pattern) return [];

  const { folded, map } = foldWithMap(text);
  const expression = new RegExp(pattern, "g");
  const ranges: HighlightRange[] = [];
  for (
    let match = expression.exec(folded);
    match !== null;
    match = expression.exec(folded)
  ) {
    if (match[0].length === 0) {
      expression.lastIndex += 1;
      continue;
    }
    const start = map[match.index];
    const end = Math.max(map[match.index + match[0].length], start + 1);
    ranges.push({ start, end });
  }
  return ranges;
}
