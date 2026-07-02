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
 * The label text shown above a user bubble in a multiplayer thread, or `null`
 * to show none:
 *  - authorless message → no label (single-player / legacy turn).
 *  - the viewer's own message → `authorLabels.you` if provided, else no label.
 *  - a teammate's message → their display name, falling back to the userId.
 */
export function authorLabelFor(
  author: MessageAuthor | undefined,
  currentUserId: string | undefined,
  authorLabels: ChatAuthorLabels | undefined,
): string | null {
  if (!author) return null;
  if (author.userId === currentUserId) return authorLabels?.you ?? null;
  return author.name ?? author.userId;
}
