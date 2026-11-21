import type { KanbanColumnConfig, KanbanItem } from "@houston-ai/board";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { BoardSelectionModel } from "./board-selection-model";
import { ColumnActionsMenu } from "./column-actions-menu";
import { useBoardBulkActions } from "./use-board-bulk-actions";

const LOCKED_SECTION_SENTINEL = " mixed-section";

export function useBoardSelectionUI({
  baseColumns,
  allItems,
  selection,
  openChatId,
  onCloseOpenChat,
}: {
  baseColumns: KanbanColumnConfig[];
  allItems: KanbanItem[];
  selection?: BoardSelectionModel;
  openChatId?: string | null;
  onCloseOpenChat?: () => void;
}) {
  const { t } = useTranslation("board");

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
      const alreadySelected = selection.selectedIds.has(item.id);
      if (!alreadySelected && selectionLockColumnId) {
        if (columnOfStatus(item.status) !== selectionLockColumnId) return;
      }
      selection.toggle(item);
    },
    [selection, selectionLockColumnId, columnOfStatus],
  );

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

  const bulkActions = useBoardBulkActions({
    selection,
    selectionLockColumnId,
    allItems,
    openChatId,
    onCloseOpenChat,
  });

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
