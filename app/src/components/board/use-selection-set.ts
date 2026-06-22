import type { KanbanItem } from "@houston-ai/board";
import { useCallback, useEffect, useState } from "react";
import { selectAllIds } from "../../lib/mission-selection";

/**
 * The multi-select set half of a {@link BoardSelectionModel}, identical for
 * the per-agent board and cross-agent Mission Control. Only the bulk dispatch
 * (move / archive / delete) differs, so each selection hook layers its own
 * mutations on top of this shared state. Resets whenever `resetKey` changes
 * so a reused board can't carry a stale selection into a new scope.
 */
export function useSelectionSet(resetKey: string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is a prop-derived reset trigger; the effect must re-run when it changes to clear stale selections across scope transitions
  useEffect(() => {
    setSelectedIds(new Set());
  }, [resetKey]);

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
