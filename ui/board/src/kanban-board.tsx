import { useMemo } from "react"
import { KanbanColumn } from "./kanban-column"
import type { KanbanCardLabels } from "./kanban-card"
import type { KanbanItem, KanbanColumn as KanbanColumnType } from "./types"

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
}: KanbanBoardProps) {
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
      {columnData.map((col) => (
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
        />
      ))}
    </div>
  )
}
