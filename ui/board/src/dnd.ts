import type { KanbanColumn, KanbanItem } from "./types"

/** `dataTransfer` MIME type for an internal kanban card drag. Set on drag
 *  start so the browser initiates a valid move drag (Firefox requires some
 *  payload) — the drop itself is resolved from the board's drag state, not
 *  from this value. */
export const BOARD_CARD_DRAG_TYPE = "application/x-houston-kanban-card"

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
