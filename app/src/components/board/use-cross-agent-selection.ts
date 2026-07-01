import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { ARCHIVED_STATUS } from "../../lib/mission-selection";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity, tauriAttachments } from "../../lib/tauri";
import { useDraftStore } from "../../stores/drafts";
import type { BoardSelectionModel } from "./board-source";
import { groupIdsByAgent } from "./group-ids-by-agent";
import { useSelectionSet } from "./use-selection-set";

/**
 * Cross-agent multi-select + bulk actions for Mission Control.
 *
 * The board spans every agent, but each `tauriActivity.bulkUpdate` /
 * `bulkDelete` call is scoped to a single agent. So a bulk action groups the
 * selection by owning agent ({@link groupIdsByAgent}) and fans out one call
 * per agent, then refreshes both the flattened cross-agent query and each
 * touched agent's per-agent activity query (so the board tab stays in sync).
 * Failures propagate so the caller surfaces a toast (no silent swallow).
 */
export function useCrossAgentSelection({
  resetKey,
  paths,
  agentPathForId,
}: {
  resetKey: string;
  /** Every agent path on the Mission Control view (for query invalidation). */
  paths: string[];
  /** Resolve a mission id to its owning agent path. */
  agentPathForId: (id: string) => string | undefined;
}): BoardSelectionModel {
  const { selectedIds, toggle, selectAll, clear } = useSelectionSet(resetKey);
  const qc = useQueryClient();

  const invalidate = useCallback(
    (touchedPaths: string[]) => {
      qc.invalidateQueries({ queryKey: queryKeys.allConversations(paths) });
      for (const agentPath of touchedPaths) {
        qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
      }
    },
    [qc, paths],
  );

  const dispatchUpdate = useCallback(
    async (ids: string[], update: { status?: string }) => {
      const groups = groupIdsByAgent(ids, agentPathForId);
      await Promise.all(
        Object.entries(groups).map(([agentPath, groupIds]) =>
          tauriActivity.bulkUpdate(agentPath, groupIds, update),
        ),
      );
      invalidate(Object.keys(groups));
    },
    [agentPathForId, invalidate],
  );

  const dispatchDelete = useCallback(
    async (ids: string[]) => {
      const groups = groupIdsByAgent(ids, agentPathForId);
      await Promise.all(
        Object.entries(groups).map(([agentPath, groupIds]) =>
          tauriActivity.bulkDelete(agentPath, groupIds),
        ),
      );
      // Per-conversation cleanup is idempotent + best-effort; the bulk delete
      // above already succeeded, so a stray attachment/draft must not fail the
      // whole action. Mirrors useBulkDeleteActivity.
      for (const id of ids) {
        await tauriAttachments.delete(`activity-${id}`).catch(() => {});
        useDraftStore.getState().clearDraft(`activity-${id}`);
      }
      invalidate(Object.keys(groups));
    },
    [agentPathForId, invalidate],
  );

  const move = useCallback(
    async (status: string) => {
      await dispatchUpdate(Array.from(selectedIds), { status });
      clear();
    },
    [dispatchUpdate, selectedIds, clear],
  );

  const archive = useCallback(async () => {
    await dispatchUpdate(Array.from(selectedIds), { status: ARCHIVED_STATUS });
    clear();
  }, [dispatchUpdate, selectedIds, clear]);

  const remove = useCallback(async () => {
    await dispatchDelete(Array.from(selectedIds));
    clear();
  }, [dispatchDelete, selectedIds, clear]);

  return { selectedIds, toggle, selectAll, clear, move, archive, remove };
}
