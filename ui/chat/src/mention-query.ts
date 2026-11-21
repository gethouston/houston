import { isMentionStart, mentionKey } from "./mention-text.ts";
import type { MentionPerson } from "./types";

export const MENTION_QUERY_MAX_LEN = 32;

export const MENTION_SUGGESTION_LIMIT = 6;

export { mentionKey } from "./mention-text.ts";

export interface MentionQuery {
  start: number;
  query: string;
}

export function findMentionQuery(
  text: string,
  caret: number,
): MentionQuery | null {
  const end = Math.max(0, Math.min(caret, text.length));
  for (let i = end - 1; i >= 0; i -= 1) {
    const char = text[i] as string;
    if (char === "\n") return null;
    if (char !== "@") continue;
    if (!isMentionStart(text, i)) return null;
    const query = text.slice(i + 1, end);
    return isTypeableQuery(query) ? { start: i, query } : null;
  }
  return null;
}

const MENTION_QUERY_MAX_SPACES = 2;

function isTypeableQuery(query: string): boolean {
  if (query.length > MENTION_QUERY_MAX_LEN) return false;
  if (query.includes("@")) return false;
  if (query.startsWith(" ") || query.endsWith(" ")) return false;
  if (query.includes("  ")) return false;
  return (query.match(/ /g)?.length ?? 0) <= MENTION_QUERY_MAX_SPACES;
}

export function filterMentionPeople(
  people: readonly MentionPerson[],
  query: string,
): MentionPerson[] {
  const key = mentionKey(query.trim());
  const matches = key
    ? people.filter((person) => matchesPrefix(person.name, key))
    : [...people];
  return matches.slice(0, MENTION_SUGGESTION_LIMIT);
}

function matchesPrefix(name: string, key: string): boolean {
  const normalized = mentionKey(name);
  if (normalized.startsWith(key)) return true;
  return normalized.split(/\s+/).some((word) => word.startsWith(key));
}

const TRAILING_PUNCTUATION = new Set([
  ",",
  ".",
  ";",
  ":",
  "!",
  "?",
  ")",
  "]",
  "}",
  '"',
  "'",
  "”",
  "’",
  "…",
]);

export function insertMention(
  text: string,
  start: number,
  caret: number,
  person: MentionPerson,
): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(Math.max(start, caret));
  const following = after.charAt(0);
  const spaced = following === " ";
  const tight =
    following !== "" &&
    (spaced || /\s/.test(following) || TRAILING_PUNCTUATION.has(following));
  const inserted = tight ? `@${person.name}` : `@${person.name} `;
  return {
    text: `${before}${inserted}${after}`,
    caret: before.length + inserted.length + (spaced ? 1 : 0),
  };
}

export function isMentionListOpen(state: {
  enabled: boolean;
  suggestionCount: number;
  active: MentionQuery | null;
  dismissedStart: number | null;
}): boolean {
  if (!state.enabled || state.suggestionCount === 0) return false;
  if (!state.active) return false;
  return state.dismissedStart !== state.active.start;
}

export function carryDismissal(
  dismissedStart: number | null,
  next: MentionQuery | null,
): number | null {
  return next ? dismissedStart : null;
}
