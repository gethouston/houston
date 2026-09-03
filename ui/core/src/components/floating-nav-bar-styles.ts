/**
 * The floating nav bar's class vocabulary, split out of the component so the
 * rules are unit-testable without a React renderer — the same split
 * `status-badge-styles.ts` makes.
 */

/** Shared by both item states: a ≥44px tap target with press feedback and a
 *  visible focus ring (Houston forbids invisible focus). */
const ITEM_BASE =
  "flex min-h-11 items-center justify-center rounded-full transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/**
 * One item's classes. The ACTIVE item is the only one that wears a fill and
 * shows its label: it expands into an inner pill inside the bar, so the bar
 * says where you are without spending width on three labels.
 */
export function floatingNavItemClasses(active: boolean): string {
  return active
    ? `${ITEM_BASE} gap-2 bg-tab-active px-4 text-ink`
    : `${ITEM_BASE} min-w-11 text-ink-muted`;
}

/** The pill the items ride in. */
export const FLOATING_NAV_PILL_CLASSES =
  "flex h-14 min-w-0 flex-1 items-center justify-around gap-1 rounded-full bg-chip px-1.5 ht-hairline";

/** The round action button beside the pill (its own target, not an item). */
export const FLOATING_NAV_ACTION_CLASSES =
  "flex size-14 shrink-0 items-center justify-center rounded-full bg-chip text-ink transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ht-hairline";
