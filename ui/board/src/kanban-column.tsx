import { cn } from "@houston-ai/core";
import { motion } from "framer-motion";
import { KanbanCard, type KanbanCardLabels } from "./kanban-card";
import { KanbanColumnAdd, KanbanColumnHeader } from "./kanban-column-parts";
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
  /** Spread onto the add button; see `KanbanColumnConfig.addAttrs`. */
  addAttrs?: Record<string, string>;
  onSelect: (item: KanbanItem) => void;
  onDelete?: (item: KanbanItem) => void;
  onApprove?: (item: KanbanItem) => void;
  onArchive?: (item: KanbanItem) => void;
  onRename?: (item: KanbanItem, newTitle: string) => void;
  runningStatuses?: string[];
  approveStatuses?: string[];
  archiveStatuses?: string[];
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
  addAttrs,
  onSelect,
  onDelete,
  onApprove,
  onArchive,
  onRename,
  runningStatuses,
  approveStatuses,
  archiveStatuses,
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
  const addButton = onAdd && (
    <KanbanColumnAdd label={addLabel} attrs={addAttrs} onClick={onAdd} />
  );

  return (
    <div
      // Name must match board-drag-dom's COLUMN_ID_ATTR (drop hit-testing).
      data-kanban-column={columnId}
      className={cn(
        // Desktop-only chrome: below the breakpoint the board is not rendered
        // at all (the phone shows a grouped task list instead), so there is no
        // phone layer to carry here.
        "min-w-[180px] flex-1 flex flex-col h-full min-h-0 rounded-xl bg-chip transition-[box-shadow,background-color] duration-150",
        // Valid drop target during a drag: a faint inset ring hints "drop here".
        // The column the pointer is over gets a stronger ring + tint.
        isDropTarget &&
          (isOver
            ? "ring-2 ring-inset ring-action/40 bg-hover"
            : "ring-1 ring-inset ring-action/15"),
      )}
    >
      <KanbanColumnHeader
        label={label}
        count={items.length}
        action={headerAction}
      />

      {/* Cards. `pt-1` so the selected ring on the first card isn't
          clipped by the scroll container's top edge. */}
      <div className="flex-1 px-1.5 pt-1 pb-1.5 space-y-1.5 overflow-y-auto">
        {/* Cards mount/unmount with NO enter/exit animation: switching agents
            swaps the whole item set, and any fade would cross-blend the
            previous agent's cards with the next one's (HOU-858). `layout`
            stays so a card gliding between columns still animates. */}
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
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
                onArchive={onArchive ? () => onArchive(item) : undefined}
                onRename={
                  onRename ? (title) => onRename(item, title) : undefined
                }
                runningStatuses={runningStatuses}
                approveStatuses={approveStatuses}
                archiveStatuses={archiveStatuses}
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
        {addButton}
      </div>
    </div>
  );
}
