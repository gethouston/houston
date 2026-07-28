/**
 * Composer-side mention logic (HOU-944): what the caret is currently
 * "@querying", which people match it, what accepting one does to the text, and
 * when the suggestion list is open. Pure, no React, no i18n. What a SEND ends
 * up carrying is `mention-send.ts`.
 */

import { isMentionStart, mentionKey } from "./mention-text.ts";
import type { MentionPerson } from "./types";

/** Past this many characters after the "@" the user is writing prose, not
 *  picking a person, and the popover closes. */
export const MENTION_QUERY_MAX_LEN = 32;

/** How many people the popover offers at once. */
export const MENTION_SUGGESTION_LIMIT = 6;

export { mentionKey } from "./mention-text.ts";

/** The active "@query" at the caret: `start` is the index of the `@`. */
export interface MentionQuery {
  start: number;
  query: string;
}

/**
 * The active "@query" at the caret, or null. An `@` counts only at the start of
 * the text or after whitespace/an opening bracket; the query runs from after
 * the `@` to the caret and may contain single interior spaces (so "@Ada Lo"
 * still matches "Ada Lovelace"), never a newline, and is capped at
 * MENTION_QUERY_MAX_LEN — past that the popover closes.
 */
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

/** How many single spaces a query may hold — enough for a three-part name,
 *  short of letting a whole sentence read as one mention query. */
const MENTION_QUERY_MAX_SPACES = 2;

/**
 * A query is still "someone's name being typed" while it holds no second `@`,
 * no run of spaces, few enough single spaces to still be a name, and stays
 * under the length cap. Its spaces must be INTERIOR: a leading space means the
 * user abandoned the mention ("@ "), and a trailing one means they finished a
 * word and moved on — which is also what closes the list the instant a pick is
 * accepted, since accepting writes "@Name " with the caret past the space.
 * Whether it matches anyone is the roster filter's call, not this one's.
 */
function isTypeableQuery(query: string): boolean {
  if (query.length > MENTION_QUERY_MAX_LEN) return false;
  if (query.includes("@")) return false;
  if (query.startsWith(" ") || query.endsWith(" ")) return false;
  if (query.includes("  ")) return false;
  return (query.match(/ /g)?.length ?? 0) <= MENTION_QUERY_MAX_SPACES;
}

/**
 * People whose name matches `query` (a prefix of the full name OR of any word
 * in it), in roster order, capped at MENTION_SUGGESTION_LIMIT. An empty query
 * returns the first N people. Diacritic-insensitive: typing "jose" offers
 * "José". (Placing a SPAN is not — see `mentionSpanKey`.)
 */
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

/** Characters that END a phrase, before which a space would be an orphan:
 *  "@Ada , thanks" is not how anyone writes. Opening brackets and quotes are
 *  deliberately absent — a name butted against "(" needs its space. */
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

/**
 * Replace the active query span with "@Name" and report the new caret.
 *
 * A trailing space follows the name when the text needs one: at the end of the
 * message, or before another word. Whitespace already there is reused rather
 * than doubled, and closing punctuation gets none at all.
 */
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

/**
 * Whether the suggestion list shows.
 *
 * A dismissal (Escape, and accepting a pick) sticks for the LIFETIME OF THE
 * TOKEN it was made in: typing one more character after Escape must not bring
 * the list back, and the just-accepted "@Name" must not re-offer itself the
 * moment the caret lands after it. `dismissedStart` is the `@` index it was
 * made at — see {@link carryDismissal} for when it lifts.
 */
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

/**
 * The dismissal to keep as the active query moves to `next`. It survives every
 * edit INSIDE its token and lifts the moment the token stops existing (the
 * "@" was deleted, the caret left it, the query stopped being a name) — after
 * which a brand new "@" opens the list again.
 */
export function carryDismissal(
  dismissedStart: number | null,
  next: MentionQuery | null,
): number | null {
  return next ? dismissedStart : null;
}
