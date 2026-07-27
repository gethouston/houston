/**
 * Pure author-attribution helpers for multiplayer conversations. Kept in a
 * `.ts` module (no JSX) so the rules are unit-testable under `node --test`;
 * `chat-messages.tsx` re-exports and renders them.
 */

import type { ChatMessage } from "./feed-to-messages";
import type { MessageAuthor } from "./types";

/** The authorship facts a rendered row decides its side and its announcement
 *  from. A `Pick` so the rules stay callable from a test with a two-field
 *  literal instead of a whole message. */
type AuthoredRow = Pick<ChatMessage, "from" | "author">;

/**
 * Consumer-supplied labels for author attribution. The library stays
 * i18n-agnostic: the app passes `t()` strings in.
 *
 * - `you`: the viewer's own rows are never LABELLED on screen (HOU-960 — a
 *   group chat does not write your name on your own bubble), but they still
 *   need an identity for a screen reader, which cannot see that the bubble is
 *   right-aligned. This string is announced there. Omitted = announce nothing.
 */
export interface ChatAuthorLabels {
  you?: string;
}

/**
 * The last-resort name for an author we know only by id: a short slice, never
 * the raw id. User ids are opaque UUIDs and the reader is non-technical — a
 * 36-character id above a bubble reads as a bug, and the initials derived from
 * it would be two random hex characters. Same rule as the board's face-stack
 * label fallback (the app's `mission-people.ts`), duplicated rather than shared
 * because `ui/` may not import app code.
 */
function shortIdName(userId: string): string {
  return userId.slice(0, 8);
}

/**
 * Is this user turn the VIEWER's own? Own turns keep the right-aligned bubble
 * with no face and no name; everyone else's mirror to the left.
 *
 * Two absences both resolve to "own", deliberately:
 *  - no author at all — single-player, or a turn from before author stamping.
 *    Those transcripts must render exactly as they always did.
 *  - no known viewer — the signed-in identity has not resolved yet. Guessing
 *    "teammate" there would paint the viewer's own bubbles on the left and snap
 *    them right a moment later, so the quiet answer is today's layout.
 */
export function isOwnMessage(
  author: MessageAuthor | undefined,
  currentUserId: string | undefined,
): boolean {
  if (!author || !currentUserId) return true;
  return author.userId === currentUserId;
}

/**
 * Does this row mirror to the LEFT, as somebody else's turn?
 *
 * Alignment follows the WRITER and nothing else — never the name-label
 * heuristic. Gating the side on "are we labelling senders?" would paint a
 * teammate's words in the viewer's OWN right-aligned bubble whenever the
 * thread holds a single non-viewer author (the ≥2-author heuristic, or the
 * window before `capabilities` resolves `showSenders`), and would then flip
 * that bubble to the left mid-scroll the moment pagination pulled a second
 * author into view. Misattribution is worse than an unlabelled bubble.
 *
 * Single player is untouched: an authorless row is "own" by
 * {@link isOwnMessage}, so it stays on the right.
 */
export function isPeerRow(
  message: AuthoredRow,
  currentUserId: string | undefined,
): boolean {
  return (
    message.from === "user" && !isOwnMessage(message.author, currentUserId)
  );
}

/**
 * Should this row announce "You" to a screen reader? Only when the transcript
 * PROVES the viewer wrote it: a recorded author, a known viewer, and the two
 * being the same person.
 *
 * {@link isOwnMessage} answers a layout question and so resolves its two
 * unknowns (no author, no viewer) to "own" — the quiet side to be wrong on
 * visually. An announcement is a factual claim, and those same unknowns make
 * it unprovable, so this rule refuses them: an assistive-tech user hears
 * nothing rather than an authorship the data does not support.
 */
export function announcesSelfAuthorship(
  message: AuthoredRow,
  currentUserId: string | undefined,
  attributed: boolean,
): boolean {
  if (!attributed || message.from !== "user") return false;
  if (!message.author || !currentUserId) return false;
  return message.author.userId === currentUserId;
}

/**
 * The name printed inside a user bubble, or `null` for no name line:
 *  - the viewer's own message → `null`. A group chat labels the people you are
 *    talking TO, never you; your own bubble is identified by its side.
 *  - a teammate's message → their display name, falling back to a short id.
 *  - an authorless message → `null`; there is nobody to name.
 */
export function senderNameFor(
  author: MessageAuthor | undefined,
  currentUserId: string | undefined,
): string | null {
  if (!author || isOwnMessage(author, currentUserId)) return null;
  return author.name ?? shortIdName(author.userId);
}
