import type { KanbanItem } from "./types";

/**
 * The mission card's quiet unread mark: the presentation rule + its tokens,
 * kept pure so the gate is unit-tested without a DOM (the same split as
 * `kanban-people-logic.ts`).
 *
 * Deliberately the SAME language as the app shell's sidebar unread dot — a
 * small filled `bg-action` circle, never a count chip — so "there is something
 * new here for you" reads identically wherever it appears, and never like the
 * "act now" signal (a card's needs-you status, the sidebar's count badge).
 */

/** The dot's box. A fixed 12px square keeps the 6px dot optically centred on
 *  the card's 11px header line; `shrink-0` protects it from the truncating
 *  agent name beside it. Rendered ONLY when the mark shows, so a card with
 *  nothing new reserves no rail and its layout is untouched. */
export const UNREAD_DOT_BOX_CLASS =
  "ml-1.5 flex size-3 shrink-0 items-center justify-center";

/** The mark itself: a 6px filled circle on the semantic action token, which is
 *  near-ink in BOTH themes (light `#0d0d0d`, dark `#e5e5e5`) — the quietest
 *  possible way to be unmissable, and never a decorative colour. */
export const UNREAD_DOT_CLASS = "size-1.5 rounded-full bg-action";

/**
 * Does this card paint the unread mark?
 *
 * Two gates, both load-bearing:
 *
 * - Only an explicit `unread === true`. The prop is optional and a board that
 *   never computes it (single player, any surface with no per-person read
 *   state) must render exactly what it rendered before — nothing, not an empty
 *   rail.
 * - Never on the card that is currently OPEN in the detail panel. The reader is
 *   looking at the mission right now, so the mark would be telling them about
 *   the thing on their screen; it also swallows the flicker between the click
 *   and the read cursor moving.
 */
export function showsUnreadDot(
  item: Pick<KanbanItem, "unread">,
  selected: boolean,
): boolean {
  return item.unread === true && !selected;
}
