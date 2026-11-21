import {
  extractSnippet,
  findFoldedMatch,
  foldForSearch,
  type MissionSnippet,
} from "./mission-highlight.ts";

export interface SearchableText {
  text: string;
  folded: string;
}

export function toSearchableText(text: string): SearchableText {
  return { text, folded: foldForSearch(text) };
}

export function matchesSearchable(
  source: SearchableText,
  phrase: string,
): boolean {
  return findFoldedMatch(source.folded, phrase) !== null;
}

export function snippetFor(
  source: SearchableText,
  phrase: string,
): MissionSnippet | null {
  const match = findFoldedMatch(source.folded, phrase);
  if (!match) return null;
  const firstLine = countNewlines(source.folded, match.start);
  const lastLine = countNewlines(source.folded, match.end);
  return extractSnippet(lineSpan(source.text, firstLine, lastLine), phrase);
}

function countNewlines(text: string, index: number): number {
  let count = 0;
  for (
    let at = text.indexOf("\n");
    at !== -1 && at < index;
    at = text.indexOf("\n", at + 1)
  ) {
    count++;
  }
  return count;
}

function lineSpan(text: string, from: number, to: number): string {
  const start = lineStart(text, from);
  const lastStart = lineStart(text, to);
  const end = text.indexOf("\n", lastStart);
  return text.slice(start, end === -1 ? text.length : end);
}

function lineStart(text: string, line: number): number {
  let at = 0;
  for (let n = 0; n < line; n++) {
    const nl = text.indexOf("\n", at);
    if (nl === -1) return text.length;
    at = nl + 1;
  }
  return at;
}
