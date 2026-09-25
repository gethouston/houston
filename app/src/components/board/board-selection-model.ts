import type { KanbanItem } from "@houston-ai/board";

/**
 * Multi-select state + bulk mutations for one board. The set-state half is
 * generic (see `useSelectionSet`); the bulk dispatch (`move` / `archive` /
 * `remove`) groups the selection by agent before writing, because one
 * cross-agent selection can span several agents. The section lock, toggle
 * guard, header actions, and bulk-bar labels are derived by `<MissionBoard>`
 * and stay out of here.
 */
export interface BoardSelectionModel {
  selectedIds: ReadonlySet<string>;
  /** Add/remove a single card. The shared component applies the section-lock
   *  guard before calling this. */
  toggle: (item: KanbanItem) => void;
  /** Add a whole section's ids to the selection (the column header
   *  "Select all in column"). Additive + idempotent — deselect is the bulk
   *  bar's "Clear", never this. */
  selectAll: (ids: string[]) => void;
  clear: () => void;
  /** Move every selected card to `status` (a bulk move target). */
  move: (status: string) => Promise<void>;
  /** Archive every selected card. */
  archive: () => Promise<void>;
  /** Delete every selected card. */
  remove: () => Promise<void>;
}
