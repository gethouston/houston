import type { ReactNode } from "react";

/**
 * What the phone's "More" menu lists, as a pure model.
 *
 * The destinations are the RAIL's own (`buildSidebarNavItems`), handed in
 * rather than built here: one destination list, one set of tour anchors, one
 * set of gates for both breakpoints. This module only does the two things the
 * menu adds — drop the runs a gate emptied (a heading must never outlive the
 * rows it names) and name the footer's help actions — so the rules are
 * unit-tested without React (`app/tests/mobile-more-items.test.ts`).
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

/** A footer action. It points at no screen, which is why it sits under the
 *  destinations rather than among them. */
export interface MobileMoreFooterRow {
  id: "reportProblem";
  label: string;
  onSelect: () => void;
}

export function mobileMoreFooterRows(args: {
  reportProblem: string;
  onReportProblem: () => void;
}): MobileMoreFooterRow[] {
  return [
    {
      id: "reportProblem",
      label: args.reportProblem,
      onSelect: args.onReportProblem,
    },
  ];
}
