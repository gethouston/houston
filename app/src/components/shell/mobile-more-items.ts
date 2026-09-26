import type { ReactNode } from "react";

/**
 * What the phone's "More" menu lists, as a pure model.
 *
 * The destinations are the RAIL's own (`buildSidebarNavItems`), handed in
 * rather than built here: one destination list, one set of tour anchors, one
 * set of gates for both breakpoints. The one thing this module adds is dropping
 * the runs a gate emptied, so a heading never outlives the rows it names
 * (`app/tests/mobile-more-items.test.ts`).
 */

/** One row, structurally the rail's `SidebarNavItemEntry`. Restated locally
 *  so this stays a dependency-free model file. */
export interface MobileMoreRow {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  trailing?: ReactNode;
  dataAttrs?: Record<string, string>;
}

/** One run of rows under an optional band label. */
export interface MobileMoreGroup {
  id: string;
  label?: string;
  items: MobileMoreRow[];
}

/** The menu's destination groups: the rail's runs, minus the empty ones. */
export function mobileMoreItems(
  sections: readonly MobileMoreGroup[],
): MobileMoreGroup[] {
  return sections
    .filter((section) => section.items.length > 0)
    .map(({ id, label, items }) => ({ id, label, items }));
}
