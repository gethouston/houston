import { AnimatePresence, motion } from "framer-motion"
import { Plus } from "lucide-react"
import type { KanbanItem } from "./types"
import { KanbanCard, type KanbanCardLabels } from "./kanban-card"

export interface KanbanColumnProps {
  label: string
  items: KanbanItem[]
  selectedId?: string | null
  onAdd?: () => void
  addLabel?: string
  onSelect: (item: KanbanItem) => void
  onDelete?: (item: KanbanItem) => void
  onApprove?: (item: KanbanItem) => void
  onResume?: (item: KanbanItem) => void
  onRename?: (item: KanbanItem, newTitle: string) => void
  runningStatuses?: string[]
  approveStatuses?: string[]
  resumeStatuses?: string[]
  renderCard?: (item: KanbanItem) => React.ReactNode
  actions?: (item: KanbanItem) => React.ReactNode
  avatar?: React.ReactNode
  cardLabels?: KanbanCardLabels
}

export function KanbanColumn({
  label,
  items,
  onAdd,
  addLabel = "Add item",
  onSelect,
  onDelete,
  onApprove,
  onResume,
  onRename,
  runningStatuses,
  approveStatuses,
  resumeStatuses,
  renderCard,
  actions,
  avatar,
  cardLabels,
}: KanbanColumnProps) {
  return (
    <div className="min-w-[180px] flex-1 flex flex-col h-full min-h-0 rounded-xl bg-secondary">
      {/* Column header */}
      <div className="px-3 py-2.5 flex items-center justify-center relative shrink-0">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-foreground">{label}</h3>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground/60 tabular-nums">
              {items.length}
            </span>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 px-1.5 pb-1.5 space-y-1.5 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {renderCard ? (
                renderCard(item)
              ) : (
                <KanbanCard
                  item={item}
                  onSelect={() => onSelect(item)}
                  onDelete={onDelete ? () => onDelete(item) : undefined}
                  onApprove={onApprove ? () => onApprove(item) : undefined}
                  onResume={onResume ? () => onResume(item) : undefined}
                  onRename={onRename ? (title) => onRename(item, title) : undefined}
                  runningStatuses={runningStatuses}
                  approveStatuses={approveStatuses}
                  resumeStatuses={resumeStatuses}
                  actions={actions?.(item)}
                  avatar={avatar}
                  labels={cardLabels}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {onAdd && (
          <button
            type="button"
            aria-label={addLabel}
            title={addLabel}
            onClick={onAdd}
            className="flex h-10 w-full items-center justify-center rounded-2xl border border-black/[0.06] bg-white/80 text-muted-foreground/80 transition-colors hover:border-black/[0.12] hover:bg-white hover:text-foreground [[data-theme=dark]_&]:border-black/70 [[data-theme=dark]_&]:bg-[#0d0d0d] [[data-theme=dark]_&]:text-muted-foreground [[data-theme=dark]_&]:hover:border-black [[data-theme=dark]_&]:hover:bg-[#141414] [[data-theme=dark]_&]:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
