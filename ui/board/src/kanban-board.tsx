import { useCallback, useMemo, useState } from "react"
import { KanbanColumn } from "./kanban-column"
import type { KanbanCardLabels } from "./kanban-card"
import type { KanbanItem, KanbanColumn as KanbanColumnType } from "./types"
import { defaultCanDropItem } from "./dnd"

export interface KanbanBoardProps {
  columns: KanbanColumnType[]
  items: KanbanItem[]
  selectedId?: string | null
  highlightedId?: string | null
  onSelect?: (item: KanbanItem) => void
  onDelete?: (item: KanbanItem) => void
  onApprove?: (item: KanbanItem) => void
  onRename?: (item: KanbanItem, newTitle: string) => void
  emptyState?: React.ReactNode
  renderCard?: (item: KanbanItem) => React.ReactNode
  runningStatuses?: string[]
  approveStatuses?: string[]
  errorStatuses?: string[]
  actions?: (item: KanbanItem) => React.ReactNode
  avatar?: React.ReactNode
  cardLabels?: KanbanCardLabels
  /** Enable per-card multi-select checkboxes. */
  selectable?: boolean
  /** Ids currently in the multi-select set. */
  selectedIds?: ReadonlySet<string>
  /** Toggle a card's membership in the multi-select set. */
  onToggleSelect?: (item: KanbanItem) => void
  /** When set, only this column's cards stay selectable — others hide their
   *  checkbox so a multi-selection can't span sections. */
  selectionLockColumnId?: string | null
  /** Called when a card is dropped onto a different column. Receives the
   *  dragged item and the target column id. Providing this enables drag-and-
   *  drop on the board. */
  onItemMove?: (item: KanbanItem, toColumnId: string) => void
  /** Override which columns accept a given dragged item. Defaults to "any
   *  column whose statuses don't already include the item's status". Return
   *  false to reject the column (it won't highlight or accept a drop). */
  canDropItem?: (item: KanbanItem, toColumnId: string) => boolean
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
  const dndEnabled = !!onItemMove
  // The card currently being dragged (null when idle). Held here so every
  // column can tell — during dragover, before the drop fires — whether it's a
  // valid target for this card and render the affordance accordingly.
  const [draggingItem, setDraggingItem] = useState<KanbanItem | null>(null)
  const handleCardDragEnd = useCallback(() => setDraggingItem(null), [])
  const resolveCanDrop = useCallback(
    (item: KanbanItem, columnId: string) => {
      if (canDropItem) return canDropItem(item, columnId)
      const col = columns.find((c) => c.id === columnId)
      return col ? defaultCanDropItem(item, col) : false
    },
    [canDropItem, columns],
  )

  const columnData = useMemo(() => {
    return columns.map((col) => {
      const colItems = items
        .filter((item) => col.statuses.includes(item.status))
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() -
            new Date(a.updatedAt).getTime(),
        )
      return { ...col, items: colItems }
    })
  }, [columns, items])

  if (items.length === 0 && emptyState) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        {emptyState}
      </div>
    )
  }

  return (
    <div className="flex-1 flex gap-3 p-3 min-h-0 overflow-hidden">
      {columnData.map((col) => {
        const isDropTarget =
          dndEnabled &&
          draggingItem != null &&
          resolveCanDrop(draggingItem, col.id)
        return (
          <KanbanColumn
            key={col.id}
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
              (selectionLockColumnId == null || selectionLockColumnId === col.id)
            }
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            dndEnabled={dndEnabled}
            isDropTarget={isDropTarget}
            onCardDragStart={setDraggingItem}
            onCardDragEnd={handleCardDragEnd}
            onCardDrop={() => {
              if (draggingItem) onItemMove?.(draggingItem, col.id)
            }}
          />
        )
      })}
    </div>
  )
}
