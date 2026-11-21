import type { KanbanColumn, KanbanItem } from "./types";

export function defaultCanDropItem(
  item: KanbanItem,
  column: KanbanColumn,
): boolean {
  return !column.statuses.includes(item.status);
}

export type ColumnDragRole = "idle" | "origin" | "drop-target" | "forbidden";

export function columnDragRole(
  draggingItem: KanbanItem | null,
  column: KanbanColumn,
  canDrop: boolean,
): ColumnDragRole {
  if (!draggingItem) return "idle";
  if (column.statuses.includes(draggingItem.status)) return "origin";
  return canDrop ? "drop-target" : "forbidden";
}
