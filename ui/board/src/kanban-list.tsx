import { AnimatePresence, motion } from "framer-motion"
import { KanbanListItem } from "./kanban-list-item"
import type { KanbanCardLabels } from "./kanban-card"
import type { KanbanItem } from "./types"

export interface KanbanListProps {
  items: KanbanItem[]
  selectedId?: string | null
  onSelect: (item: KanbanItem) => void
  onDelete?: (item: KanbanItem) => void
  avatar?: React.ReactNode
  cardLabels?: KanbanCardLabels
  emptyState?: React.ReactNode
}

/**
 * Compact, column-less list of board items (used by the Archived missions
 * tab). Rows reuse `KanbanListItem` — agent icon + name, title, delete — so
 * the list reads as short rectangles. Items are sorted newest-first.
 */
export function KanbanList({
  items,
  selectedId,
  onSelect,
  onDelete,
  avatar,
  cardLabels,
  emptyState,
}: KanbanListProps) {
  if (items.length === 0 && emptyState) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        {emptyState}
      </div>
    )
  }

  const sorted = [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
      <div className="mx-auto w-full max-w-2xl space-y-1.5">
        <AnimatePresence mode="popLayout">
          {sorted.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <KanbanListItem
                item={item}
                avatar={avatar}
                selected={selectedId === item.id}
                onSelect={() => onSelect(item)}
                onDelete={onDelete ? () => onDelete(item) : undefined}
                labels={cardLabels}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
