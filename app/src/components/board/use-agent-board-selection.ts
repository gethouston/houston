import { useCallback } from "react";
import { useBulkUpdateActivity, useBulkDeleteActivity } from "../../hooks/queries";
import { ARCHIVED_STATUS } from "../../lib/mission-selection";
import { useSelectionSet } from "./use-selection-set";
import type { BoardSelectionModel } from "./board-source";

/**
 * Per-agent multi-select + bulk actions for the board tab. The selection
 * set + UI live in {@link useSelectionSet}; this layer wires the agent-scoped
 * bulk mutations. The selection resets whenever `resetKey` changes (the tab
 * is reused across agents, so a selection must not bleed between them). Bulk
 * actions clear the selection on success; failures propagate so the caller
 * surfaces a toast (no silent swallow).
 */
export function useAgentBoardSelection(
  agentPath: string | undefined,
  resetKey: string,
): BoardSelectionModel {
  const { selectedIds, toggle, selectAll, clear } = useSelectionSet(resetKey);
  const bulkUpdate = useBulkUpdateActivity(agentPath);
  const bulkDelete = useBulkDeleteActivity(agentPath);

  const move = useCallback(
    async (status: string) => {
      await bulkUpdate.mutateAsync({ ids: Array.from(selectedIds), update: { status } });
      clear();
    },
    [bulkUpdate, selectedIds, clear],
  );

  const archive = useCallback(async () => {
    await bulkUpdate.mutateAsync({
      ids: Array.from(selectedIds),
      update: { status: ARCHIVED_STATUS },
    });
    clear();
  }, [bulkUpdate, selectedIds, clear]);

  const remove = useCallback(async () => {
    await bulkDelete.mutateAsync(Array.from(selectedIds));
    clear();
  }, [bulkDelete, selectedIds, clear]);

  return { selectedIds, toggle, selectAll, clear, move, archive, remove };
}
