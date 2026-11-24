import { cn } from "@houston-ai/core";
import { motion } from "framer-motion";
import { KanbanCard, type KanbanCardLabels } from "./kanban-card";
import { KanbanColumnAdd, KanbanColumnHeader } from "./kanban-column-parts";
import type { MessageTimeFormatter } from "./message-time";
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
  formatTime?: MessageTimeFormatter;
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
  formatTime,
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
      data-kanban-column={columnId}
      className={cn(
        "min-w-[180px] flex-1 flex flex-col h-full min-h-0 rounded-xl bg-chip transition-[box-shadow,background-color] duration-150",
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

      <div className="flex-1 pl-1.5 pt-1 pb-1.5 space-y-1.5 overflow-y-scroll [scrollbar-gutter:stable] supports-[not_selector(::-webkit-scrollbar)]:pr-1.5">
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
                formatTime={formatTime}
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
