import { AnimatePresence, motion } from "framer-motion"
import { KanbanListRail } from "./kanban-list-rail"
import { KanbanListItem } from "./kanban-list-item"
import type { KanbanCardLabels } from "./kanban-card"
import type { BoardSearchSnippet, KanbanItem } from "./types"

export interface KanbanListProps {
  items: KanbanItem[]
  selectedId?: string | null
  onSelect: (item: KanbanItem) => void
  onDelete?: (item: KanbanItem) => void
  avatar?: React.ReactNode
  cardLabels?: KanbanCardLabels
  emptyState?: React.ReactNode
  /** Per-item matched body fragment, keyed by `KanbanItem.id`, shown below a row
   *  when the search matched in the body rather than the title. */
  searchSnippets?: Record<string, BoardSearchSnippet>
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
  searchSnippets,
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
      <KanbanListRail className="space-y-1.5">
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
                snippet={searchSnippets?.[item.id]}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </KanbanListRail>
    </div>
  )
}
