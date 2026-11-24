import type { ChatMessage } from "./feed-to-messages";
import type { MessageAuthor } from "./types";

type AuthoredRow = Pick<ChatMessage, "from" | "author">;

/**
 * Consumer-supplied labels for author attribution. The library stays
 * i18n-agnostic: the app passes `t()` strings in.
 *
 * - `you`: the viewer's own rows are never LABELLED on screen (a
 *   group chat does not write your name on your own bubble), but they still
 *   need an identity for a screen reader, which cannot see that the bubble is
 *   right-aligned. This string is announced there. Omitted = announce nothing.
 */
export interface ChatAuthorLabels {
  you?: string;
}

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

export function isPeerRow(
  message: AuthoredRow,
  currentUserId: string | undefined,
): boolean {
  return (
    message.from === "user" && !isOwnMessage(message.author, currentUserId)
  );
}

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
