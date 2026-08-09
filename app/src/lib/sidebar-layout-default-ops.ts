import type { SidebarLayout } from "@houston-ai/engine-client";

/**
 * The DEFAULT team's own state, which lives on the LAYOUT rather than in
 * `groups` — the counterpart of `sidebar-layout-group-ops.ts`.
 *
 * Every NAMED team is a stored `SidebarGroup` carrying its own fields. The
 * default team is VIRTUAL (it IS the workspace, holding every agent in no
 * group), so it owns no row to carry anything, and each thing a named team
 * keeps on its group the default team keeps here instead.
 */

/**
 * Toggle the DEFAULT team block's collapsed state. Absent is expanded, which is
 * why the first toggle folds it shut.
 */
export function toggleDefaultCollapsedOp(layout: SidebarLayout): SidebarLayout {
  return { ...layout, defaultCollapsed: !(layout.defaultCollapsed ?? false) };
}

/**
 * Set the DEFAULT team's shared context — `setGroupContextOp` for the team with
 * no group row. The host mirrors the result into every UNGROUPED agent's
 * `GROUP.md` on the same write, which is the identical mechanism a named team's
 * context rides, so the card's promise holds for both.
 *
 * An emptied box stores `""` rather than dropping the key, exactly as
 * `setGroupContextOp` does: the host trims, so blank and absent are one state
 * downstream, and one spelling of "cleared" beats two.
 */
export function setDefaultContextOp(
  layout: SidebarLayout,
  context: string,
): SidebarLayout {
  return { ...layout, defaultContext: context };
}
