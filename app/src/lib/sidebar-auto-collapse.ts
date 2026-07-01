/**
 * Decide whether a window-width change should auto-toggle the sidebar.
 *
 * The rail auto-collapses when the window narrows past a threshold (e.g. Houston
 * docked to half the screen) and auto-expands when it widens back. The decision
 * is made only on the threshold CROSSING — between crossings the user's manual
 * toggle is left untouched, so a deliberate expand on a narrow window sticks.
 */

/** Width (px) at/below which the sidebar collapses to its icon rail. */
export const SIDEBAR_AUTO_COLLAPSE_WIDTH = 1000;

/**
 * @param prevWidth the previously observed width, or `null` on the first run
 * @param width the current width
 * @param threshold collapse boundary (defaults to {@link SIDEBAR_AUTO_COLLAPSE_WIDTH})
 * @returns `true` → collapse, `false` → expand, `null` → no crossing, leave as-is
 */
export function resolveAutoCollapse(
  prevWidth: number | null,
  width: number,
  threshold: number = SIDEBAR_AUTO_COLLAPSE_WIDTH,
): boolean | null {
  const wasWideOrUnknown = prevWidth === null || prevWidth >= threshold;
  if (wasWideOrUnknown && width < threshold) return true;
  if (prevWidth !== null && prevWidth < threshold && width >= threshold) {
    return false;
  }
  return null;
}
