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
