import type { KanbanItem } from "@houston-ai/board";
import { useCallback, useState } from "react";
import { selectAllIds } from "../../lib/mission-selection";

/**
 * The multi-select set half of a {@link BoardSelectionModel}, identical for
 * the per-agent board and cross-agent Mission Control. Only the bulk dispatch
 * (move / archive / delete) differs, so each selection hook layers its own
 * mutations on top of this shared state.
 */
export function useSelectionSet() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((item: KanbanItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => selectAllIds(prev, ids));
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return { selectedIds, setSelectedIds, toggle, selectAll, clear };
}
