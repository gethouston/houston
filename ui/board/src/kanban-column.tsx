import { AnimatePresence, motion } from "framer-motion"
import { Plus } from "lucide-react"
import { cn } from "@houston-ai/core"
import type { KanbanItem } from "./types"
import { KanbanCard, type KanbanCardLabels } from "./kanban-card"
import { useColumnDropTarget } from "./use-column-drop-target"

export interface KanbanColumnProps {
  label: string
  items: KanbanItem[]
  selectedId?: string | null
  highlightedId?: string | null
  onAdd?: () => void
  addLabel?: string
  onSelect: (item: KanbanItem) => void
  onDelete?: (item: KanbanItem) => void
  onApprove?: (item: KanbanItem) => void
  onRename?: (item: KanbanItem, newTitle: string) => void
  runningStatuses?: string[]
  approveStatuses?: string[]
  errorStatuses?: string[]
  renderCard?: (item: KanbanItem) => React.ReactNode
  actions?: (item: KanbanItem) => React.ReactNode
  avatar?: React.ReactNode
  cardLabels?: KanbanCardLabels
  /** Node rendered on the right of the column header (e.g. archive-all). */
  headerAction?: React.ReactNode
  /** Enable per-card multi-select checkboxes. */
  selectable?: boolean
  /** Ids currently in the multi-select set. */
  selectedIds?: ReadonlySet<string>
  /** Toggle a card's membership in the multi-select set. */
  onToggleSelect?: (item: KanbanItem) => void
  /** Make this column's cards draggable. */
  dndEnabled?: boolean
  /** Whether this column accepts the card currently being dragged. When true
   *  the column shows a drop affordance and handles the drop; when false it
   *  ignores the drag entirely. */
  isDropTarget?: boolean
  /** Whether this column should accept the drag-over without being a real drop
   *  target (true for `isDropTarget` columns AND the dragged card's own
   *  section). When true but not a drop target, the cursor reads as a move
   *  rather than the browser's forbidden marker, and the drop is a no-op. */
  allowDragOver?: boolean
  /** Whether any card on the board is currently being dragged. Drives the
   *  cursor: a forbidden column (e.g. running) shows `not-allowed`. */
  dragActive?: boolean
  /** A card in this column started being dragged. */
  onCardDragStart?: (item: KanbanItem) => void
  /** The active drag ended (drop or cancel). */
  onCardDragEnd?: () => void
  /** A card was dropped on this column (only fires when `isDropTarget`). */
  onCardDrop?: () => void
}

export function KanbanColumn({
  label,
  items,
  selectedId,
  highlightedId,
  onAdd,
  addLabel = "Add item",
  onSelect,
  onDelete,
  onApprove,
  onRename,
  runningStatuses,
  approveStatuses,
  errorStatuses,
  renderCard,
  actions,
  avatar,
  cardLabels,
  headerAction,
  selectable,
  selectedIds,
  onToggleSelect,
  dndEnabled,
  isDropTarget = false,
  allowDragOver = isDropTarget,
  dragActive = false,
  onCardDragStart,
  onCardDragEnd,
  onCardDrop,
}: KanbanColumnProps) {
  const anySelected = (selectedIds?.size ?? 0) > 0
  const { isOver, dragHandlers } = useColumnDropTarget(
    isDropTarget,
    () => onCardDrop?.(),
    allowDragOver,
  )
  // A drag is in flight but this column refuses it (e.g. the running section):
  // keep the browser's forbidden cursor and reinforce it for the CSS layer.
  const isForbidden = dragActive && !allowDragOver

  return (
    <div
      {...dragHandlers}
      className={cn(
        "min-w-[180px] flex-1 flex flex-col h-full min-h-0 rounded-xl bg-secondary transition-[box-shadow,background-color] duration-150",
        // Valid drop target during a drag: a faint inset ring hints "drop here".
        // The column the pointer is over gets a stronger ring + tint.
        isDropTarget &&
          (isOver
            ? "ring-2 ring-inset ring-primary/40 bg-accent"
            : "ring-1 ring-inset ring-primary/15"),
        // The forbidden section keeps the not-allowed cursor over its whole
        // subtree (overriding the board's best-effort grab). Drop targets and
        // the origin section inherit the board's grab cursor.
        isForbidden && "cursor-not-allowed",
      )}
    >
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
        {headerAction && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {headerAction}
          </div>
        )}
      </div>

      {/* Cards. `pt-1` so the selected ring on the first card isn't
          clipped by the scroll container's top edge. */}
      <div className="flex-1 px-1.5 pt-1 pb-1.5 space-y-1.5 overflow-y-auto">
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
                  selected={selectedId === item.id}
                  highlighted={highlightedId === item.id}
                  onSelect={() => onSelect(item)}
                  onDelete={onDelete ? () => onDelete(item) : undefined}
                  onApprove={onApprove ? () => onApprove(item) : undefined}
                  onRename={onRename ? (title) => onRename(item, title) : undefined}
                  runningStatuses={runningStatuses}
                  approveStatuses={approveStatuses}
                  errorStatuses={errorStatuses}
                  actions={actions?.(item)}
                  avatar={avatar}
                  labels={cardLabels}
                  selectable={selectable}
                  selectedForBulk={selectedIds?.has(item.id) ?? false}
                  anySelected={anySelected}
                  onToggleSelect={
                    onToggleSelect ? () => onToggleSelect(item) : undefined
                  }
                  enableDrag={dndEnabled}
                  dragActive={dragActive}
                  onDragStart={
                    onCardDragStart ? () => onCardDragStart(item) : undefined
                  }
                  onDragEnd={onCardDragEnd}
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
