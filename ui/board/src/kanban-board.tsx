import { useMemo } from "react"
import { KanbanColumn } from "./kanban-column"
import type { KanbanCardLabels } from "./kanban-card"
import type { KanbanItem, KanbanColumn as KanbanColumnType } from "./types"

export interface KanbanBoardProps {
  columns: KanbanColumnType[]
  items: KanbanItem[]
  selectedId?: string | null
  onSelect?: (item: KanbanItem) => void
  onDelete?: (item: KanbanItem) => void
  onApprove?: (item: KanbanItem) => void
  onResume?: (item: KanbanItem) => void
  onRename?: (item: KanbanItem, newTitle: string) => void
  emptyState?: React.ReactNode
  renderCard?: (item: KanbanItem) => React.ReactNode
  runningStatuses?: string[]
  approveStatuses?: string[]
  resumeStatuses?: string[]
  actions?: (item: KanbanItem) => React.ReactNode
  avatar?: React.ReactNode
  cardLabels?: KanbanCardLabels
}

export function KanbanBoard({
  columns,
  items,
  onSelect,
  onDelete,
  onApprove,
  onResume,
  onRename,
  emptyState,
  renderCard,
  runningStatuses,
  approveStatuses,
  resumeStatuses,
  actions,
  avatar,
  cardLabels,
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
          onAdd={col.onAdd}
          addLabel={col.addLabel}
          onSelect={onSelect ?? (() => {})}
          onDelete={onDelete}
          onApprove={onApprove}
          onResume={onResume}
          onRename={onRename}
          renderCard={renderCard}
          runningStatuses={runningStatuses}
          approveStatuses={approveStatuses}
          resumeStatuses={resumeStatuses}
          actions={actions}
          avatar={avatar}
          cardLabels={cardLabels}
        />
      ))}
    </div>
  )
}
