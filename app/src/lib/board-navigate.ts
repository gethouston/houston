import type { KanbanColumnConfig, KanbanItem } from "@houston-ai/board";

export type BoardDir = "up" | "down" | "left" | "right";

interface NavigateInput {
  items: KanbanItem[];
  columns: KanbanColumnConfig[];
  selectedId: string | null;
}

export function navigateBoard(
  { items, columns, selectedId }: NavigateInput,
  dir: BoardDir,
): string | null {
  const grouped = columns.map((col) => ({
    items: items
      .filter((i) => col.statuses.includes(i.status))
      .slice()
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime(),
      ),
  }));

  let colIdx = -1;
  let rowIdx = -1;
  for (let c = 0; c < grouped.length; c++) {
    const r = grouped[c].items.findIndex((i) => i.id === selectedId);
    if (r !== -1) {
      colIdx = c;
      rowIdx = r;
      break;
    }
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
  for (let c = colIdx + 1; c < grouped.length; c++) {
    const len = grouped[c].items.length;
    if (len > 0) return grouped[c].items[Math.min(rowIdx, len - 1)].id;
  }
  return null;
}
