import {
  extractSnippet,
  findFoldedMatch,
  foldForSearch,
  type MissionSnippet,
} from "./mission-highlight.ts";

/**
 * A body of text prepared for mission search: the ORIGINAL (what a snippet
 * renders, accents and casing intact) alongside its fold (what matching runs
 * against).
 *
 * The split exists because folding is the expensive half: a mission's
 * transcript is folded ONCE, when it loads, so every later keystroke only
 * re-runs a regex over the cached fold (HOU-941 — re-folding every transcript
 * per keystroke is what made search take 10-15s).
 */
export interface SearchableText {
  /** The text as it should be shown to the user. */
  text: string;
  /** {@link foldForSearch} of `text` — never rendered, only matched. */
  folded: string;
}

export function toSearchableText(text: string): SearchableText {
  return { text, folded: foldForSearch(text) };
}

/** Whether the already-folded body contains the (already folded) `phrase`. */
export function matchesSearchable(
  source: SearchableText,
  phrase: string,
): boolean {
  return findFoldedMatch(source.folded, phrase) !== null;
}

/**
 * The "why did this match" snippet for a searchable body.
 *
 * The snippet is cut from the LINE(S) the match falls on, never from the whole
 * body: highlighting needs an exact folded->original index map, and building
 * one is a per-character walk. Searchable bodies are newline-joined messages,
 * so one line is one message — bounded, whatever the transcript's length.
 *
 * Line numbers are fold-invariant (folding never adds, removes or reorders a
 * newline), so the folded match's line span selects the same lines in the
 * original text. A phrase whose flexible whitespace spans messages matches
 * across lines, hence a span rather than a single line.
 */
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

/** How many newlines `text` holds strictly before `index`. */
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

/** The slice of `text` covering lines `from`..`to` (0-based, inclusive). */
function lineSpan(text: string, from: number, to: number): string {
  const start = lineStart(text, from);
  const lastStart = lineStart(text, to);
  const end = text.indexOf("\n", lastStart);
  return text.slice(start, end === -1 ? text.length : end);
}

/** Index in `text` where 0-based `line` begins (clamped to the end). */
function lineStart(text: string, line: number): number {
  let at = 0;
  for (let n = 0; n < line; n++) {
    const nl = text.indexOf("\n", at);
    if (nl === -1) return text.length;
    at = nl + 1;
  }
  return at;
}
