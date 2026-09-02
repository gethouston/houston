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
  /** Centered hint when a PAGED column holds no cards (an empty page on the
   *  phone board must say so). Ignored off the pager. */
  emptyLabel?: string;
  /** Phone pager page (below md): the segmented pager above already names the
   *  section, so the column draws no header; its "+" leads the page instead
   *  of trailing the cards; and the page sits flat on the screen rather than
   *  in a chip-tinted column. Desktop (unset) is the classic column. */
  paged?: boolean;
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
  emptyLabel,
  paged = false,
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
        // Phone layer: the board is a pager — each column is one full-width
        // page snapping into the horizontally-scrolling board container.
        // Desktop (md+) restores the classic multi-column layout.
        "min-w-full snap-center md:min-w-[180px] md:snap-align-none flex-1 flex flex-col h-full min-h-0 rounded-xl transition-[box-shadow,background-color] duration-150",
        // A paged column is the whole page: flat on the screen, no chip tint
        // boxing a lone empty hint. The classic column keeps its tint.
        paged ? "bg-transparent" : "bg-chip",
        // Valid drop target during a drag: a faint inset ring hints "drop here".
        // The column the pointer is over gets a stronger ring + tint.
        isDropTarget &&
          (isOver
            ? "ring-2 ring-inset ring-action/40 bg-hover"
            : "ring-1 ring-inset ring-action/15"),
      )}
    >
      {/* Column header. A paged column has none: the pager above is the one
          place the section is named, and its header action rides the page's
          top-right corner on its own. */}
      {paged ? (
        headerAction && (
          <div className="flex shrink-0 justify-end px-1.5 pb-1">
            {headerAction}
          </div>
        )
      ) : (
        <KanbanColumnHeader
          label={label}
          count={items.length}
          action={headerAction}
        />
      )}

      {/* Cards. `pt-1` so the selected ring on the first card isn't
          clipped by the scroll container's top edge. */}
      <div className="flex-1 px-1.5 pt-1 pb-1.5 space-y-1.5 overflow-y-auto">
        {/* On the pager the "+" LEADS the page: it is the page's one action
            and must sit above the fold, not under an empty hint that fills
            the height. Desktop keeps it after the cards. */}
        {paged && addButton}
        {/* An empty PAGE on the phone pager says so; desktop keeps its bare
            column (the whole-board empty state covers the truly empty
            board). */}
        {paged && items.length === 0 && emptyLabel && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-muted">
            {emptyLabel}
          </div>
        )}
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
        {!paged && addButton}
      </div>
    </div>
  );
}
