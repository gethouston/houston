import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { allCachedConversationRows } from "../../lib/cached-conversation-rows";
import { forgetDeletedConversationDrafts } from "../../lib/conversation-drafts";
import { ARCHIVED_STATUS } from "../../lib/mission-selection";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity } from "../../lib/tauri";
import type { BoardSelectionModel } from "./board-selection-model";
import { groupIdsByAgent } from "./group-ids-by-agent";
import { useSelectionSet } from "./use-selection-set";

/**
 * Cross-agent multi-select + bulk actions for Mission Control.
 *
 * The board spans every agent, but each `tauriActivity.bulkUpdate` /
 * `bulkDelete` call is scoped to a single agent. So a bulk action groups the
 * selection by owning agent ({@link groupIdsByAgent}) and fans out one call
 * per agent, then refreshes both the flattened cross-agent query and each
 * touched agent's per-agent activity query (so every board stays in sync).
 * Failures propagate so the caller surfaces a toast (no silent swallow).
 */
export function useCrossAgentSelection({
  paths,
  agentPathForId,
}: {
  /** Every agent path on the Mission Control view (for query invalidation). */
  paths: string[];
  /** Resolve a mission id to its owning agent path. */
  agentPathForId: (id: string) => string | undefined;
}): BoardSelectionModel {
  const { selectedIds, toggle, selectAll, clear } = useSelectionSet();
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
      // Read BEFORE the delete: a mission's unsent work is parked under the
      // conversation key its row names, and this board's own rows are the only
      // place that key survives the delete and the invalidation below. Every
      // roster variant of the aggregate at once, so a key drift cannot mask a
      // mission — the same union the per-agent delete seams read.
      const rows = allCachedConversationRows(qc, paths);
      await Promise.all(
        Object.entries(groups).map(([agentPath, groupIds]) =>
          tauriActivity.bulkDelete(agentPath, groupIds),
        ),
      );
      // Attached files stay in each workspace's uploads/ folder (HOU-706);
      // only the unsent drafts need clearing. Mirrors useBulkDeleteActivity.
      forgetDeletedConversationDrafts(ids, rows);
      invalidate(Object.keys(groups));
    },
    [agentPathForId, invalidate, paths, qc],
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
