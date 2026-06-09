import type { KanbanColumn, KanbanItem } from "./types"

/**
 * Default drop eligibility: a card may drop on any column whose statuses do
 * NOT already contain the card's current status — i.e. only a move to a
 * different section counts. Consumers override via `canDropItem` to layer on
 * their own rules (e.g. forbidding a manual move into a "running" column).
 */
export function defaultCanDropItem(
  item: KanbanItem,
  column: KanbanColumn,
): boolean {
  return !column.statuses.includes(item.status)
}

/**
 * Role a column plays for the in-flight drag. Drives its drop affordance and
 * cursor:
 *  - `idle` — nothing is being dragged.
 *  - `origin` — the dragged card's current section. Dropping here is a no-op,
 *    but it isn't forbidden, so the grab cursor ("the hand") stays. No drop
 *    highlight.
 *  - `drop-target` — a section that accepts the move (highlights + moves on
 *    drop).
 *  - `forbidden` — a section that rejects the drop (e.g. running) → the cursor
 *    switches to `not-allowed`.
 *
 * `canDrop` is the already-resolved eligibility for THIS column (from the
 * board's `canDropItem` override or `defaultCanDropItem`).
 */
export type ColumnDragRole = "idle" | "origin" | "drop-target" | "forbidden"

export function columnDragRole(
  draggingItem: KanbanItem | null,
  column: KanbanColumn,
  canDrop: boolean,
): ColumnDragRole {
  if (!draggingItem) return "idle"
  if (column.statuses.includes(draggingItem.status)) return "origin"
  return canDrop ? "drop-target" : "forbidden"
}
