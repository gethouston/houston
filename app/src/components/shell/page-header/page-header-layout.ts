export type HeaderMode = "full" | "compact" | "stacked";

export interface HeaderThresholds {
  oneRowMin: number;
  compactMin?: number;
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
  if (width >= thresholds.oneRowMin) return "full";
  if (thresholds.compactMin === undefined) return "stacked";
  return width >= thresholds.compactMin ? "compact" : "stacked";
}

/** Whether the page's tools belong in the strip. */
export function headerHoldsTools(mode: HeaderMode): boolean {
  return mode !== "stacked";
}

/** Whether navigation collapses into its identity lozenge. */
export function headerCollapsesTabs(mode: HeaderMode): boolean {
  return mode !== "full";
}

/**
 * The strip's height, declared ONCE and never by anything inside it. A frame
 * whose height follows its contents is not a frame.
 */
export const HEADER_HEIGHT = "h-12";

export type HeaderHome = "strip" | "top-bar";

/**
 * Where the header's identity cluster is drawn. Below the breakpoint the
 * ACTIVE screen's cluster rides the phone top bar, beside the drawer control,
 * so the screen card opens on its own content instead of a second chrome row.
 * Only the screen on the glass may claim that slot (kept-alive screens stay
 * mounted while hidden), and only while the bar itself is mounted.
 */
export function headerHome(input: {
  isMobile: boolean;
  isActive: boolean;
  slotMounted: boolean;
}): HeaderHome {
  return input.isMobile && input.isActive && input.slotMounted
    ? "top-bar"
    : "strip";
}
