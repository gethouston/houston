import type { KanbanItem } from "@houston-ai/board";

export interface BoardSelectionModel {
  selectedIds: ReadonlySet<string>;
  toggle: (item: KanbanItem) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
  move: (status: string) => void;
  archive: () => void;
  remove: () => void;
}
