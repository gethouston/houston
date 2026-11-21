import type { FeedFrame } from "../turns/history";

const COMBINING_MARKS = /[\u0300-\u036f]/g;

function foldChar(char: string): string {
  return char.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase();
}

export function foldForSearch(text: string): string {
  let folded = "";
  for (let i = 0; i < text.length; i++) folded += foldChar(text[i]);
  return folded;
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

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function phrasePattern(phrase: string): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words.map((w) => w.replace(REGEXP_SPECIALS, "\\$&")).join("\\s+");
}

export function normalizeQuery(value: string): string {
  return foldForSearch(value).replace(/\s+/g, " ").trim();
}

export function matchesPhrase(
  text: string | undefined,
  foldedPhrase: string,
): boolean {
  const pattern = phrasePattern(foldedPhrase);
  if (!text || !pattern) return false;
  return new RegExp(pattern).test(foldForSearch(text));
}

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

export function buildHistorySearchText(frames: FeedFrame[]): string {
  return frames.map(frameToSearchText).filter(Boolean).join("\n");
}
