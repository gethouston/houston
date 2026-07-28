/**
 * Pure author-attribution helpers for multiplayer conversations (C5). Kept in a
 * `.ts` module (no JSX) so the label rule is unit-testable under `node --test`;
 * `chat-messages.tsx` re-exports and renders them.
 */

import type { MessageAuthor } from "./types";

/**
 * Consumer-supplied labels for author attribution. The library stays
 * i18n-agnostic: the app passes `t()` strings in.
 *
 * - `you`: when set, the viewer's OWN messages show this label (e.g. "You").
 *   When omitted, the viewer's own messages show no label at all — the
 *   consumer decides which behavior it wants.
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
 * The label text shown above a user bubble in a multiplayer thread, or `null`
 * to show none:
 *  - authorless message → no label (single-player / legacy turn).
 *  - the viewer's own message → `authorLabels.you` if provided, else no label.
 *  - a teammate's message → their display name, falling back to a short id.
 */
export function authorLabelFor(
  author: MessageAuthor | undefined,
  currentUserId: string | undefined,
  authorLabels: ChatAuthorLabels | undefined,
): string | null {
  if (!author) return null;
  if (author.userId === currentUserId) return authorLabels?.you ?? null;
  return author.name ?? shortIdName(author.userId);
}

/**
 * The sender name for a user bubble when attribution is FORCED on (`showSenders`
 * — a multiplayer deployment labels every turn, however many people have
 * written). Same rule as {@link authorLabelFor} except the viewer is never
 * anonymous: with no `you` label their own name (then a short id) stands in, so
 * no row in a shared thread is left unattributed. An authorless message
 * (single-player history, or a send by a client with no identity) still yields
 * `null` — there is nobody to name.
 */
export function senderNameFor(
  author: MessageAuthor | undefined,
  currentUserId: string | undefined,
  authorLabels: ChatAuthorLabels | undefined,
): string | null {
  if (!author) return null;
  if (author.userId === currentUserId)
    return authorLabels?.you ?? author.name ?? shortIdName(author.userId);
  return author.name ?? shortIdName(author.userId);
}
