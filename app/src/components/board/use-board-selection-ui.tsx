import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanColumnConfig, KanbanItem } from "@houston-ai/board";
import { useUIStore } from "../../stores/ui";
import {
  areAllSelected,
  moveTargetsForSection,
} from "../../lib/mission-selection";
import { ArchiveDoneButton } from "../archive-done-button";
import { SelectAllButton } from "../select-all-button";
import type { BoardSelectionModel } from "./board-source";

// Sentinel lock used when a selection no longer maps to exactly one board
// section (a live status change split it, or it spans sections). It matches no
// real column id, so every column keeps its checkbox hidden until the user
// clears — recovering from a cross-section selection.
const LOCKED_SECTION_SENTINEL = " mixed-section";

/**
 * Derives the multi-select UI from a {@link BoardSelectionModel}: the section
 * lock, the toggle guard (so a selection can never span sections), the Done
 * "archive all" + Needs-you "select all" column header actions, and the
 * floating bulk-action-bar config. Identical for the per-agent board and
 * cross-agent Mission Control — only the model's bulk dispatch differs.
 *
 * Section ids and the archive-all target are read from `allItems` (the
 * unsearched active set) so the header actions act on the whole section
 * regardless of the current search.
 */
export function useBoardSelectionUI({
  baseColumns,
  allItems,
  selection,
}: {
  baseColumns: KanbanColumnConfig[];
  allItems: KanbanItem[];
  selection?: BoardSelectionModel;
}) {
  const { t } = useTranslation(["board", "dashboard"]);
  const addToast = useUIStore((s) => s.addToast);

  const columnOfStatus = useCallback(
    (status: string) =>
      baseColumns.find((c) => c.statuses.includes(status))?.id ?? null,
    [baseColumns],
  );
  const idsInColumn = useCallback(
    (columnId: string) =>
      allItems.filter((a) => columnOfStatus(a.status) === columnId).map((a) => a.id),
    [allItems, columnOfStatus],
  );
  const doneIds = useMemo(() => idsInColumn("done"), [idsInColumn]);
  const needsYouIds = useMemo(() => idsInColumn("needs_you"), [idsInColumn]);

  // Lock derives from the WHOLE selection, not just the first card, so a live
  // status change can't drop the lock to null and silently reopen cross-section
  // selection — if it ever spans/loses its section we keep the sentinel.
  const selectionLockColumnId = useMemo(() => {
    if (!selection || selection.selectedIds.size === 0) return null;
    const sections = new Set<string>();
    for (const a of allItems) {
      if (!selection.selectedIds.has(a.id)) continue;
      const col = columnOfStatus(a.status);
      if (col) sections.add(col);
    }
    return sections.size === 1 ? [...sections][0] : LOCKED_SECTION_SENTINEL;
  }, [selection, allItems, columnOfStatus]);

  const handleToggleSelect = useCallback(
    (item: KanbanItem) => {
      if (!selection) return;
      // Always allow DESELECTING; only block ADDING a card from another section
      // so the user can never build a cross-section selection.
      const alreadySelected = selection.selectedIds.has(item.id);
      if (!alreadySelected && selectionLockColumnId) {
        if (columnOfStatus(item.status) !== selectionLockColumnId) return;
      }
      selection.toggle(item);
    },
    [selection, selectionLockColumnId, columnOfStatus],
  );

  const handleArchiveDone = useCallback(() => {
    selection?.archiveIds(doneIds).catch((err) =>
      addToast({ title: t("board:bulk.error", { error: String(err) }), variant: "error" }),
    );
  }, [selection, doneIds, addToast, t]);

  const doneHeaderAction =
    selection && doneIds.length > 0 ? (
      <ArchiveDoneButton
        onConfirm={handleArchiveDone}
        labels={{
          tooltip: t("board:doneArchive.tooltip"),
          confirmTitle: t("board:doneArchive.confirmTitle"),
          confirmDescription: t("board:doneArchive.confirmDescription", {
            count: doneIds.length,
          }),
          confirmAction: t("board:doneArchive.confirmAction"),
          cancel: t("board:bulk.cancel"),
        }}
      />
    ) : undefined;

  const selectedIds = selection?.selectedIds ?? new Set<string>();
  const needsYouAllSelected = areAllSelected(needsYouIds, selectedIds);
  const needsYouHeaderAction =
    selection && selectionLockColumnId === "needs_you" ? (
      <SelectAllButton
        checked={needsYouAllSelected}
        indeterminate={
          !needsYouAllSelected && needsYouIds.some((id) => selectedIds.has(id))
        }
        onToggle={() => selection.toggleAll(needsYouIds)}
        label={t("board:bulk.selectAll")}
      />
    ) : undefined;

  const columns = useMemo(
    () =>
      baseColumns.map((c) =>
        c.id === "done"
          ? { ...c, headerAction: doneHeaderAction }
          : c.id === "needs_you"
            ? { ...c, headerAction: needsYouHeaderAction }
            : c,
      ),
    [baseColumns, doneHeaderAction, needsYouHeaderAction],
  );

  const runBulk = useCallback(
    async (op: () => Promise<void>) => {
      try {
        await op();
      } catch (err) {
        addToast({ title: t("board:bulk.error", { error: String(err) }), variant: "error" });
      }
    },
    [addToast, t],
  );

  const bulkActions = useMemo(() => {
    if (!selection) return undefined;
    return {
      moveTargets: moveTargetsForSection(selectionLockColumnId).map((status) => ({
        status,
        label:
          status === "done" ? t("dashboard:columns.done") : t("dashboard:columns.needsYou"),
      })),
      onMove: (status: string) => runBulk(() => selection.move(status)),
      onArchive: () => runBulk(() => selection.archive()),
      onDelete: () => runBulk(() => selection.remove()),
      onClear: selection.clear,
      labels: {
        selected: (count: number) => t("board:bulk.selected", { count }),
        moveTo: t("board:bulk.moveTo"),
        archive: t("board:bulk.archive"),
        delete: t("board:bulk.delete"),
        clear: t("board:bulk.clear"),
        cancel: t("board:bulk.cancel"),
        confirmMoveTitle: t("board:bulk.confirmMove.title"),
        confirmMoveDescription: (count: number, target: string) =>
          t("board:bulk.confirmMove.description", { count, target }),
        confirmMoveAction: t("board:bulk.confirmMove.action"),
        confirmArchiveTitle: t("board:bulk.confirmArchive.title"),
        confirmArchiveDescription: (count: number) =>
          t("board:bulk.confirmArchive.description", { count }),
        confirmArchiveAction: t("board:bulk.confirmArchive.action"),
        confirmDeleteTitle: t("board:bulk.confirmDelete.title"),
        confirmDeleteDescription: (count: number) =>
          t("board:bulk.confirmDelete.description", { count }),
        confirmDeleteAction: t("board:bulk.confirmDelete.action"),
      },
    };
  }, [selection, selectionLockColumnId, runBulk, t]);

  const selectionProps =
    selection && bulkActions
      ? {
          selectable: true as const,
          selectedIds: selection.selectedIds,
          onToggleSelect: handleToggleSelect,
          selectionLockColumnId,
          bulkActions,
        }
      : null;

  return { columns, selectionProps };
}
