export type HeaderMode = "full" | "stacked";

export interface HeaderThresholds {
  /** The strip width from which the page's tools fit beside the cluster. */
  oneRowMin: number;
}

/**
 * `null` is "not measured yet" and answers `stacked`: it is correct at every
 * width, so an unmeasured header renders the layout that cannot be wrong and
 * upgrades once the observer reports.
 */
export function headerMode(
  width: number | null,
  thresholds: HeaderThresholds,
): HeaderMode {
  if (width === null) return "stacked";
  return width >= thresholds.oneRowMin ? "full" : "stacked";
}

/** Whether the page's tools belong in the strip. */
export function headerHoldsTools(mode: HeaderMode): boolean {
  return mode === "full";
}

/**
 * Whether navigation collapses into its identity lozenge — the ONE rule, and a
 * PHONE rule.
 *
 * On the desktop the cluster is ALWAYS its lozenges: when the strip narrows —
 * a side panel opening beside the chat is the everyday case — what leaves is
 * the TOOLS, which take the body row, and the cluster keeps the strip (it
 * scrolls inside it if a long team name asks for more). Turning the sections a
 * user is navigating by into a closed menu to buy room for buttons that have
 * somewhere else to go is the wrong trade.
 *
 * Below the breakpoint there is no second row to give: the phone's strip holds
 * the screen's title or its sections, never both, so the cluster folds into the
 * menu its identity lozenge triggers.
 */
export function headerCollapsesTabs(
  mode: HeaderMode,
  isMobile: boolean,
): boolean {
  return isMobile && mode === "stacked";
}

/**
 * The strip's height, declared ONCE and never by anything inside it. A frame
 * whose height follows its contents is not a frame.
 */
export const HEADER_HEIGHT = "h-12";

/**
 * The same height at the DESKTOP layer only, for a strip the phone stacks
 * instead (the skill editor's header runs identity over controls below `md`).
 * Written out rather than composed, because Tailwind reads class names out of
 * the source: `` `md:${HEADER_HEIGHT}` `` would generate no rule at all. The
 * pairing is pinned by `app/tests/skill-editor-header.test.ts`.
 */
export const HEADER_HEIGHT_DESKTOP = "md:h-12";
