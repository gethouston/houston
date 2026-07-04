/**
 * Collapsed-rail "click anywhere to expand" guard. A click on the rail
 * expands the sidebar unless it landed on (or inside) something that is
 * itself interactive — agent buttons, nav items, menus, inputs — whose own
 * action must win.
 */
export const RAIL_INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, [role='menuitem'], [role='menu'], [data-rail-no-expand]";

export interface RailClickTarget {
  closest(selector: string): unknown;
}

export function shouldExpandFromRailClick(
  target: RailClickTarget | null,
): boolean {
  if (!target) return true;
  return !target.closest(RAIL_INTERACTIVE_SELECTOR);
}
