import type { HighlightRange } from "@houston-ai/core";

export interface MissionSnippet {
  text: string;
  ranges: HighlightRange[];
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;

function foldChar(char: string): string {
  return char.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase();
}

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

export function foldForSearch(value: string): string {
  return value.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase();
}

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function phrasePattern(phrase: string): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((word) => word.replace(REGEXP_SPECIALS, "\\$&"))
    .join("\\s+");
}

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

export function matchesPhrase(
  text: string | undefined,
  phrase: string,
): boolean {
  if (!text) return false;
  return findFoldedMatch(foldForSearch(text), phrase) !== null;
}

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
  radius?: number;
}

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
  return { text: snippet, ranges: findHighlightRanges(snippet, phrase) };
}
