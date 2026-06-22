import { useCallback, useMemo } from "react";
import { columnDragRole, defaultCanDropItem } from "./dnd";
import type { KanbanCardLabels } from "./kanban-card";
import { KanbanColumn } from "./kanban-column";
import type { KanbanColumn as KanbanColumnType, KanbanItem } from "./types";
import { useBoardDrag } from "./use-board-drag";

export interface KanbanBoardProps {
  columns: KanbanColumnType[];
  items: KanbanItem[];
  selectedId?: string | null;
  highlightedId?: string | null;
  onSelect?: (item: KanbanItem) => void;
  onDelete?: (item: KanbanItem) => void;
  onApprove?: (item: KanbanItem) => void;
  onRename?: (item: KanbanItem, newTitle: string) => void;
  emptyState?: React.ReactNode;
  renderCard?: (item: KanbanItem) => React.ReactNode;
  runningStatuses?: string[];
  approveStatuses?: string[];
  errorStatuses?: string[];
  actions?: (item: KanbanItem) => React.ReactNode;
  avatar?: React.ReactNode;
  cardLabels?: KanbanCardLabels;
  /** Enable per-card multi-select checkboxes. */
  selectable?: boolean;
  /** Ids currently in the multi-select set. */
  selectedIds?: ReadonlySet<string>;
  /** Toggle a card's membership in the multi-select set. */
  onToggleSelect?: (item: KanbanItem) => void;
  /** When set, only this column's cards stay selectable — others hide their
   *  checkbox so a multi-selection can't span sections. */
  selectionLockColumnId?: string | null;
  /** Called when a card is dropped onto a different column. Receives the
   *  dragged item and the target column id. Providing this enables drag-and-
   *  drop on the board. */
  onItemMove?: (item: KanbanItem, toColumnId: string) => void;
  /** Override which columns accept a given dragged item. Defaults to "any
   *  column whose statuses don't already include the item's status". Return
   *  false to reject the column (it won't highlight or accept a drop). */
  canDropItem?: (item: KanbanItem, toColumnId: string) => boolean;
}

export function KanbanBoard({
  columns,
  items,
  selectedId,
  highlightedId,
  onSelect,
  onDelete,
  onApprove,
  onRename,
  emptyState,
  renderCard,
  runningStatuses,
  approveStatuses,
  errorStatuses,
  actions,
  avatar,
  cardLabels,
  selectable,
  selectedIds,
  onToggleSelect,
  selectionLockColumnId,
  onItemMove,
  canDropItem,
}: KanbanBoardProps) {
  const dndEnabled = !!onItemMove;
  const resolveCanDrop = useCallback(
    (item: KanbanItem, columnId: string) => {
      if (canDropItem) return canDropItem(item, columnId);
      const col = columns.find((c) => c.id === columnId);
      return col ? defaultCanDropItem(item, col) : false;
    },
    [canDropItem, columns],
  );

  // Custom pointer-events drag (no native HTML5 DnD) so the cursor is the same
  // on every OS. Suppressed while a multi-select is active — the bulk action
  // bar owns moves then. The card currently being dragged is `draggingId`;
  // every column derives its drop affordance from it via `columnDragRole`.
  const { draggingId, hoverColumnId, dragHandlers } = useBoardDrag({
    items,
    columns,
    enabled: dndEnabled && (selectedIds?.size ?? 0) === 0,
    canDrop: resolveCanDrop,
    onItemMove,
  });
  const draggingItem = draggingId
    ? (items.find((i) => i.id === draggingId) ?? null)
    : null;

  const columnData = useMemo(() => {
    return columns.map((col) => {
      const colItems = items
        .filter((item) => col.statuses.includes(item.status))
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      return { ...col, items: colItems };
    });
  }, [columns, items]);

  if (items.length === 0 && emptyState) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        {emptyState}
      </div>
    );
  }

  return (
    // The drag is delegated: handlers live on the container and resolve the
    // dragged card / target column from the DOM (data attributes). The cursor
    // itself is driven by `body` classes (see use-board-drag), not here.
    <div
      {...dragHandlers}
      className="flex-1 flex gap-3 p-3 min-h-0 overflow-hidden"
    >
      {columnData.map((col) => {
        // `idle | origin | drop-target | forbidden` — see `columnDragRole`. A
        // drop target shows the faint "drop here" ring; the column under the
        // pointer (`hoverColumnId`) gets the stronger highlight.
        const role = draggingItem
          ? columnDragRole(
              draggingItem,
              col,
              resolveCanDrop(draggingItem, col.id),
            )
          : "idle";
        const isDropTarget = role === "drop-target";
        const isOver = isDropTarget && hoverColumnId === col.id;
        return (
          <KanbanColumn
            key={col.id}
            columnId={col.id}
            label={col.label}
            items={col.items}
            selectedId={selectedId}
            highlightedId={highlightedId}
            onAdd={col.onAdd}
            addLabel={col.addLabel}
            headerAction={col.headerAction}
            onSelect={onSelect ?? (() => {})}
            onDelete={onDelete}
            onApprove={onApprove}
            onRename={onRename}
            renderCard={renderCard}
            runningStatuses={runningStatuses}
            approveStatuses={approveStatuses}
            errorStatuses={errorStatuses}
            actions={actions}
            avatar={avatar}
            cardLabels={cardLabels}
            selectable={
              selectable &&
              (selectionLockColumnId == null ||
                selectionLockColumnId === col.id)
            }
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            dndEnabled={dndEnabled}
            isDropTarget={isDropTarget}
            isOver={isOver}
            draggingId={draggingId}
          />
        );
      })}
    </div>
  );
}
