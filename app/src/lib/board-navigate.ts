import type { KanbanColumnConfig, KanbanItem } from "@houston-ai/board";

export type BoardDir = "up" | "down" | "left" | "right";

interface NavigateInput {
  items: KanbanItem[];
  columns: KanbanColumnConfig[];
  selectedId: string | null;
}

/**
 * Pure kanban navigation. Mirrors KanbanBoard's per-column grouping +
 * updatedAt-desc sort so arrow keys move the selection through cards in
 * the same order the user sees them. Returns the next selectedId, or
 * `null` if there's nothing to do (empty board, no movement available).
 *
 * Behavior:
 *  - Nothing selected → first card in the first non-empty column.
 *  - Up / Down → previous / next card within the current column. Stops
 *    at column edges (no wrap; predictable for 4-direction nav).
 *  - Left / Right → first non-empty column in that direction. Tries to
 *    keep the same row index, clamping to the destination's length.
 */
export function navigateBoard({
  items,
  columns,
  selectedId,
}: NavigateInput,
  dir: BoardDir,
): string | null {
  const grouped = columns.map((col) => ({
    items: items
      .filter((i) => col.statuses.includes(i.status))
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
  }));

  let colIdx = -1;
  let rowIdx = -1;
  for (let c = 0; c < grouped.length; c++) {
    const r = grouped[c].items.findIndex((i) => i.id === selectedId);
    if (r !== -1) { colIdx = c; rowIdx = r; break; }
  }

  if (colIdx === -1) {
    for (const col of grouped) {
      if (col.items.length > 0) return col.items[0].id;
    }
    return null;
  }

  if (dir === "up") {
    if (rowIdx > 0) return grouped[colIdx].items[rowIdx - 1].id;
    return null;
  }
  if (dir === "down") {
    const last = grouped[colIdx].items.length - 1;
    if (rowIdx < last) return grouped[colIdx].items[rowIdx + 1].id;
    return null;
  }
  if (dir === "left") {
    for (let c = colIdx - 1; c >= 0; c--) {
      const len = grouped[c].items.length;
      if (len > 0) return grouped[c].items[Math.min(rowIdx, len - 1)].id;
    }
    return null;
  }
  // right
  for (let c = colIdx + 1; c < grouped.length; c++) {
    const len = grouped[c].items.length;
    if (len > 0) return grouped[c].items[Math.min(rowIdx, len - 1)].id;
  }
  return null;
}
