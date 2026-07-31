/**
 * The mission card's top-right action row: its shared geometry plus the one
 * rule that decides whether a status-gated action shows. Kept pure (no JSX) so
 * the gate is unit-tested without a DOM, the same split as
 * `kanban-card-unread.ts` and `kanban-people-logic.ts`.
 */

/** Shared geometry AND resting colour for the card's top-right action buttons:
 *  a 24px square box (the hit-target floor — `p-1` around the glyph alone left
 *  ~20px) with the glyph optically centred, every glyph at the same
 *  `ink-muted/40`.
 *
 *  The resting colour lives HERE, not per button, because the row is one
 *  control cluster: four glyphs sitting side by side at different weights read
 *  as a rendering bug. The light tint is deliberate — the row is secondary to
 *  the mission's own content and must recede until the card is being worked
 *  with; it rises to full strength on hover, where the affordance is being
 *  used. The neutral hover is the row's default too; an action with a semantic
 *  outcome (approve → success, delete → danger) appends its own `hover:` pair,
 *  which tailwind-merge lets win. */
export const ACTION_BUTTON_CLASS =
  "inline-flex size-6 items-center justify-center rounded-md text-ink-muted/40 transition-colors duration-200 hover:bg-hover hover:text-ink";

/** 16px — the product's "small" icon step. */
export const ACTION_ICON_CLASS = "size-4";

export interface CardActionGate {
  /** The card's own status. */
  itemStatus: string;
  /** Statuses this action is offered on. A card outside the list never shows
   *  it, which is what keeps the approve checkmark off a Done card and the
   *  archive box off a Needs-you one — and both off a running card, which
   *  appears in neither list. */
  actionStatuses: readonly string[];
  /** Whether the consumer wired a handler. No handler, no button. */
  handled: boolean;
  /** Whether the consumer passed its own `actions` node. A card that renders
   *  custom footer actions owns its whole action vocabulary, so the built-in
   *  status actions step aside rather than compete with it. */
  hasCustomActions: boolean;
}

/**
 * Does a status-gated card action (the approve checkmark, the archive box)
 * render on this card?
 *
 * All three gates are load-bearing and independent: the consumer must have
 * wired the handler, must not have taken the action row over with its own
 * `actions`, and the card's status must be one the action is offered on.
 */
export function showsCardAction({
  itemStatus,
  actionStatuses,
  handled,
  hasCustomActions,
}: CardActionGate): boolean {
  return handled && !hasCustomActions && actionStatuses.includes(itemStatus);
}
