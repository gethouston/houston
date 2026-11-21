import type { KanbanItem } from "@houston-ai/board";
import { useCallback, useState } from "react";
import { selectAllIds } from "../../lib/mission-selection";

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
