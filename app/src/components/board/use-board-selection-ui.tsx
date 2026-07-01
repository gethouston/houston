import type { KanbanColumnConfig, KanbanItem } from "@houston-ai/board";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { moveTargetsForSection } from "../../lib/mission-selection";
import { useUIStore } from "../../stores/ui";
import type { BoardSelectionModel } from "./board-source";
import { ColumnActionsMenu } from "./column-actions-menu";

// Sentinel lock used when a selection no longer maps to exactly one board
// section (a live status change split it, or it spans sections). It matches no
// real column id, so every column keeps its checkbox hidden until the user
// clears — recovering from a cross-section selection.
const LOCKED_SECTION_SENTINEL = " mixed-section";

/**
 * Derives the multi-select UI from a {@link BoardSelectionModel}: the section
 * lock, the toggle guard (so a selection can never span sections), the kebab
 * column-header "Select all in column" menus (Done + Needs you), and the
 * floating bulk-action-bar config. Identical for the per-agent board and
 * cross-agent Mission Control — only the model's bulk dispatch differs.
 *
 * Per-column ids are read from `allItems` (the unsearched active set) so
 * "Select all in column" grabs the whole section regardless of the current
 * search.
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
      allItems
        .filter((a) => columnOfStatus(a.status) === columnId)
        .map((a) => a.id),
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

  // "Select all in column" clears first so the result is always a clean,
  // single-section selection of the clicked column — `selectAll` itself
  // bypasses the per-card cross-section guard, so without the clear it could
  // otherwise bolt a column onto a selection already locked to another section.
  const handleSelectAll = useCallback(
    (ids: string[]) => {
      if (!selection) return;
      selection.clear();
      selection.selectAll(ids);
    },
    [selection],
  );

  const menuLabels = useMemo(
    () => ({
      menu: t("board:column.menu"),
      selectAll: t("board:column.selectAll"),
    }),
    [t],
  );

  const doneHeaderAction =
    selection && doneIds.length > 0 ? (
      <ColumnActionsMenu
        onSelectAll={() => handleSelectAll(doneIds)}
        labels={menuLabels}
      />
    ) : undefined;

  const needsYouHeaderAction =
    selection && needsYouIds.length > 0 ? (
      <ColumnActionsMenu
        onSelectAll={() => handleSelectAll(needsYouIds)}
        labels={menuLabels}
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
        addToast({
          title: t("board:bulk.error", { error: String(err) }),
          variant: "error",
        });
      }
    },
    [addToast, t],
  );

  const bulkActions = useMemo(() => {
    if (!selection) return undefined;
    return {
      moveTargets: moveTargetsForSection(selectionLockColumnId).map(
        (status) => ({
          status,
          label:
            status === "done"
              ? t("dashboard:columns.done")
              : t("dashboard:columns.needsYou"),
        }),
      ),
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
