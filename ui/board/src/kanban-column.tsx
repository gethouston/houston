import { cn } from "@houston-ai/core";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { KanbanCard, type KanbanCardLabels } from "./kanban-card";
import type { KanbanItem } from "./types";

export interface KanbanColumnProps {
  /** This column's id. Exposed on the DOM (`data-kanban-column`) so the board's
   *  pointer drag can hit-test which column a card is dropped on. */
  columnId?: string;
  label: string;
  items: KanbanItem[];
  selectedId?: string | null;
  highlightedId?: string | null;
  onAdd?: () => void;
  addLabel?: string;
  onSelect: (item: KanbanItem) => void;
  onDelete?: (item: KanbanItem) => void;
  onApprove?: (item: KanbanItem) => void;
  onRename?: (item: KanbanItem, newTitle: string) => void;
  runningStatuses?: string[];
  approveStatuses?: string[];
  errorStatuses?: string[];
  renderCard?: (item: KanbanItem) => React.ReactNode;
  actions?: (item: KanbanItem) => React.ReactNode;
  avatar?: React.ReactNode;
  cardLabels?: KanbanCardLabels;
  /** Node rendered on the right of the column header (e.g. archive-all). */
  headerAction?: React.ReactNode;
  /** Enable per-card multi-select checkboxes. */
  selectable?: boolean;
  /** Ids currently in the multi-select set. */
  selectedIds?: ReadonlySet<string>;
  /** Toggle a card's membership in the multi-select set. */
  onToggleSelect?: (item: KanbanItem) => void;
  /** Make this column's cards draggable. */
  dndEnabled?: boolean;
  /** Whether this column accepts the card currently being dragged. Drives the
   *  faint "drop here" ring during a drag. */
  isDropTarget?: boolean;
  /** Whether the dragged card is currently over this (drop-target) column.
   *  Drives the stronger highlight. */
  isOver?: boolean;
  /** Id of the card being dragged anywhere on the board (null when idle), used
   *  to dim the dragged card. */
  draggingId?: string | null;
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
  isOver = false,
  draggingId = null,
  columnId,
}: KanbanColumnProps) {
  const anySelected = (selectedIds?.size ?? 0) > 0;

  return (
    <div
      // Name must match board-drag-dom's COLUMN_ID_ATTR (drop hit-testing).
      data-kanban-column={columnId}
      className={cn(
        "min-w-[180px] flex-1 flex flex-col h-full min-h-0 rounded-xl bg-chip transition-[box-shadow,background-color] duration-150",
        // Valid drop target during a drag: a faint inset ring hints "drop here".
        // The column the pointer is over gets a stronger ring + tint.
        isDropTarget &&
          (isOver
            ? "ring-2 ring-inset ring-action/40 bg-hover"
            : "ring-1 ring-inset ring-action/15"),
      )}
    >
      {/* Column header */}
      <div className="px-3 py-2.5 flex items-center justify-center relative shrink-0">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-ink">{label}</h3>
          {items.length > 0 && (
            <span className="text-xs text-ink-muted/60 tabular-nums">
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
                  onRename={
                    onRename ? (title) => onRename(item, title) : undefined
                  }
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
                  dragging={draggingId === item.id}
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
            className="flex h-10 w-full items-center justify-center rounded-2xl border border-black/[0.06] bg-white/80 text-ink-muted/80 transition-colors hover:border-black/[0.12] hover:bg-white hover:text-ink [[data-theme=dark]_&]:border-black/70 [[data-theme=dark]_&]:bg-[#0d0d0d] [[data-theme=dark]_&]:text-ink-muted [[data-theme=dark]_&]:hover:border-black [[data-theme=dark]_&]:hover:bg-[#141414] [[data-theme=dark]_&]:hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
