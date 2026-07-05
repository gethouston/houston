/**
 * Mission-search text matching — ported from the desktop's `mission-search.ts`
 * + `mission-highlight.ts` so the SDK matches EXACTLY what the board does:
 * accent/case-insensitive, multi-word phrase matched contiguously with flexible
 * whitespace, over the same per-feed-item searchable text.
 *
 * Headless: the desktop's `HighlightRange` output (a `@houston-ai/core` type) is
 * a surface concern, so this port returns only the plain snippet STRING and a
 * boolean match — a native surface re-highlights the phrase itself.
 */

import type { FeedFrame } from "../turns/history";

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Fold one character for accent/case-insensitive matching. */
function foldChar(char: string): string {
  return char.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase();
}

/** Fold a whole string for matching (case-folded, accents stripped). */
export function foldForSearch(text: string): string {
  let folded = "";
  for (let i = 0; i < text.length; i++) folded += foldChar(text[i]);
  return folded;
}

/** Fold `text` while recording, per folded char, the source char index. */
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

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/** Regex source matching the folded phrase contiguously, whitespace flexible. */
function phrasePattern(phrase: string): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words.map((w) => w.replace(REGEXP_SPECIALS, "\\$&")).join("\\s+");
}

/** Fold + collapse internal whitespace so a multi-word query matches as a phrase. */
export function normalizeQuery(value: string): string {
  return foldForSearch(value).replace(/\s+/g, " ").trim();
}

/** Whether `text` contains the already-folded `phrase`. */
export function matchesPhrase(
  text: string | undefined,
  foldedPhrase: string,
): boolean {
  const pattern = phrasePattern(foldedPhrase);
  if (!text || !pattern) return false;
  return new RegExp(pattern).test(foldForSearch(text));
}

/**
 * A short fragment of `text` centered on the first match of the already-folded
 * `phrase`, with ellipses where clipped — the "why did this match" snippet.
 * Null when the phrase does not occur.
 */
export function extractSnippet(
  text: string,
  foldedPhrase: string,
  radius = 48,
): string | null {
  const pattern = phrasePattern(foldedPhrase);
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
  const slice = text.slice(windowStart, windowEnd).replace(/\s+/g, " ").trim();
  if (!slice) return null;
  return `${prefix}${slice}${suffix}`;
}

/** Stringify a feed frame's `data` value for search (mirrors the desktop). */
function valueToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/** The searchable text of one folded history frame (per-type, as the desktop does). */
function frameToSearchText(frame: FeedFrame): string {
  const data = frame.data;
  switch (frame.feed_type) {
    case "user_message":
      return typeof data === "string" ? data : "";
    case "tool_call": {
      const d = data as { name?: string; input?: unknown };
      return `${d?.name ?? ""} ${valueToText(d?.input)}`;
    }
    case "tool_result":
      return (data as { content?: string })?.content ?? "";
    case "tool_runtime_error":
      return "";
    case "file_changes": {
      const d = data as { created?: string[]; modified?: string[] };
      return [...(d?.created ?? []), ...(d?.modified ?? [])].join("\n");
    }
    case "final_result":
      return (data as { result?: string })?.result ?? "";
    default:
      return valueToText(data);
  }
}

/** The full searchable text of a folded conversation transcript. */
export function buildHistorySearchText(frames: FeedFrame[]): string {
  return frames.map(frameToSearchText).filter(Boolean).join("\n");
}
