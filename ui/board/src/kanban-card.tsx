import { ConfirmDialog, cn } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { KanbanCardActionRow } from "./kanban-card-action-row";
import { showsCardAction } from "./kanban-card-actions";
import { KanbanPeople } from "./kanban-people";
import {
  CARD_PEOPLE_MAX,
  peopleGutterClass,
  stackSlots,
} from "./kanban-people-logic";
import { KanbanTag } from "./kanban-tag";
import { KanbanTime } from "./kanban-time";
import type { MessageTimeFormatter } from "./message-time";
import type { KanbanItem } from "./types";

export interface KanbanCardLabels {
  /** @deprecated kept for backward-compat. Was the visible Approve pill text;
   *  the action is now an icon-only button with `approveTooltip`. */
  approve?: string;
  approveTooltip?: string;
  /** Tooltip + accessible label for the archive action (the icon carries no
   *  text, so this is its only non-visual form). */
  archiveTooltip?: string;
  renameTooltip?: string;
  deleteTooltip?: string;
  /** Delete confirm title, `{name}` substituted with `item.title`. */
  deleteTitle?: (name: string) => string;
  deleteDescription?: string;
  /** Accessible label for the multi-select checkbox. */
  selectTooltip?: string;
  /** Accessible group label for the card's people face stack. */
  people?: string;
  /** Accessible label for the people overlay's expandable "+N" chip. */
  peopleExpand?: string;
  /** Accessible label for the detail panel's icon-only close button. */
  closePanel?: string;
  /** Tooltip + accessible label for the narrow card's "more" button, which
   *  holds rename and delete when they don't fit inline. */
  moreActions?: string;
  lastMessage?: (time: string) => string;
}

const DEFAULT_LABELS: Required<KanbanCardLabels> = {
  approve: "Move to done",
  approveTooltip: "Move to done",
  archiveTooltip: "Archive",
  renameTooltip: "Change title",
  deleteTooltip: "Delete",
  deleteTitle: (name) => `Delete "${name}"?`,
  deleteDescription: "This item and its history will be permanently removed.",
  selectTooltip: "Select",
  people: "People",
  peopleExpand: "All people",
  closePanel: "Close panel",
  moreActions: "More actions",
  lastMessage: (time) => `Last message: ${time}`,
};

export interface KanbanCardProps {
  item: KanbanItem;
  onSelect: () => void;
  onDelete?: () => void;
  onApprove?: () => void;
  /** One-click "file this away". Mirrors {@link KanbanCardProps.onApprove}:
   *  the consumer decides what archiving means, the card only offers it. */
  onArchive?: () => void;
  onRename?: (newTitle: string) => void;
  runningStatuses?: string[];
  approveStatuses?: string[];
  /** Statuses whose cards offer the archive action. */
  archiveStatuses?: string[];
  errorStatuses?: string[];
  actions?: React.ReactNode;
  avatar?: React.ReactNode;
  labels?: KanbanCardLabels;
  formatTime?: MessageTimeFormatter;
  /** Mark this card as the currently-open one in the right panel. */
  selected?: boolean;
  /** Mark this card as keyboard-focused (highlighted via arrow nav, not yet
   *  opened). Renders a focus ring distinct from `selected`. */
  highlighted?: boolean;
  /** Enable the multi-select checkbox. */
  selectable?: boolean;
  /** Whether this card is part of the current multi-select set. */
  selectedForBulk?: boolean;
  /** Whether ANY card is currently multi-selected (keeps every checkbox
   *  visible without hover so the affordance isn't hover-gated). */
  anySelected?: boolean;
  /** Toggle this card's membership in the multi-select set. */
  onToggleSelect?: () => void;
  /** Make the card draggable so it can be dropped onto another column.
   *  Suppressed while renaming or during a multi-select so it doesn't
   *  collide with those interactions. The board reads the resulting
   *  `data-kanban-draggable` marker to start its pointer drag. */
  enableDrag?: boolean;
  /** True while THIS card is the one being dragged — dims it. Driven by the
   *  board's drag state. */
  dragging?: boolean;
}

export function KanbanCard({
  item,
  onSelect,
  onDelete,
  onApprove,
  onArchive,
  onRename,
  runningStatuses = ["running"],
  approveStatuses = ["needs_you"],
  archiveStatuses = ["done"],
  errorStatuses = ["error"],
  actions,
  avatar,
  labels,
  formatTime,
  selected = false,
  highlighted = false,
  selectable = false,
  selectedForBulk = false,
  anySelected = false,
  onToggleSelect,
  enableDrag = false,
  dragging = false,
}: KanbanCardProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const isRunning = runningStatuses.includes(item.status);
  const isError = errorStatuses.includes(item.status);
  // The two status-gated actions. Their status lists are disjoint by
  // construction (a mission waiting on the user vs one the user already signed
  // off), so a card shows at most one of them, and a running card neither.
  const showsApprove = showsCardAction({
    itemStatus: item.status,
    actionStatuses: approveStatuses,
    handled: !!onApprove,
    hasCustomActions: !!actions,
  });
  const showsArchive = showsCardAction({
    itemStatus: item.status,
    actionStatuses: archiveStatuses,
    handled: !!onArchive,
    hasCustomActions: !!actions,
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const deleteReturnFocus = useRef<HTMLElement | null>(null);
  // The face stack floats over the body's bottom-right corner, so the body has
  // to give it a gutter or the last line of text runs underneath the faces
  // (the artifact the landing mock avoids with `.tc-desc { padding-right }`).
  // Empty for an unattributed card, so a single-player board is byte-identical.
  const peopleGutter = peopleGutterClass(
    stackSlots(item.people ?? [], CARD_PEOPLE_MAX),
  );
  // Don't let a drag start while renaming (the title input owns the gesture)
  // or while a multi-select is active (the bulk action bar owns moves then).
  const canDrag = enableDrag && !editing && !anySelected;
  const showsSelect = selectable && !!onToggleSelect;
  const selectionActive = selectedForBulk || anySelected;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const confirmDelete = () => {
    onDelete?.();
    setShowConfirm(false);
  };

  const startRename = () => {
    setEditValue(item.title);
    setEditing(true);
  };

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== item.title) {
      onRename?.(trimmed);
    }
    setEditing(false);
  };

  return (
    <>
      <div
        role="option"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onKeyDown={(e) => {
          // Only the card itself opens on Enter/Space; key events from a focused
          // inner control (the rename input, the multi-select checkbox) bubble
          // here but carry a different target — swallowing their Space would
          // eat the typed character and open the mission instead.
          if (
            e.target === e.currentTarget &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            onSelect();
          }
        }}
        // The board runs the drag (pointer events, delegated). These markers
        // tell it which element is a card and whether it may be dragged right
        // now; `canDrag` already excludes renaming + multi-select. Attribute
        // names must match board-drag-dom (data-kanban-card / -draggable).
        data-kanban-card={item.id}
        data-kanban-draggable={canDrag ? "" : undefined}
        aria-selected={selected || highlighted}
        data-highlighted={highlighted || undefined}
        // For running + active, override the running-glow inner fill
        // (--glow-bg) so the accent tint is visible through the rotating
        // border. The accent token is a translucent overlay (rgba), which
        // would let the conic gradient bleed through — flatten it via
        // color-mix to a solid tint that matches bg-hover rendered over
        // the card background.
        style={
          (selected || highlighted) && isRunning
            ? ({
                "--glow-bg":
                  "color-mix(in srgb, var(--ht-input) 93%, currentColor 7%)",
              } as React.CSSProperties)
            : undefined
        }
        className={cn(
          // `transition-all` would also try to animate the
          // running-glow's `linear-gradient(--glow-bg, --glow-bg)`
          // background-image layer when --glow-bg flips on selection,
          // colliding with the conic-gradient keyframe animation.
          // Restrict transitions to the safe properties we actually
          // care about.
          "kanban-card @container/card group/card relative rounded-xl p-3 transition-[background-color,box-shadow,border-color] duration-200",
          // The whole card reads as clickable: a plain pointer, never the grab
          // "hand". During a drag the global `body.kanban-dragging` cursor (set
          // by the board) overrides this everywhere, so the same grab/not-
          // allowed cursor shows on every OS.
          "cursor-pointer",
          selected || highlighted ? "bg-hover" : "bg-input",
          // Running cards keep their own animated border untouched —
          // setting Tailwind's `border` would override the
          // `border-style: solid` from card-running-glow's shorthand
          // and kill the rotating gradient. For everything else, the
          // border is always 1px (transparent when active, gray
          // otherwise) so toggling state doesn't shift layout.
          isRunning
            ? "card-running-glow shadow-[0_2px_12px_var(--ht-glow-blue-shadow)]"
            : isError
              ? "border border-danger/60"
              : selected || highlighted
                ? "border border-transparent"
                : "border border-line/20",
          // Multi-select ring sits on top of (not replacing) the card's
          // own border treatment so a selected running card keeps its glow.
          // Half-strength primary (not solid) so selecting a whole column
          // reads as a calm grey outline, not a wall of hard black/white
          // edges — the filled checkbox is the primary "selected" signal.
          selectedForBulk &&
            "ring-2 ring-action/50 ring-offset-1 ring-offset-input",
          // Dim the card while it's being dragged.
          dragging && "opacity-40",
        )}
      >
        {/* Top row: agent info + action buttons */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center min-w-0 flex-1">
            {/* The multi-select checkbox takes the leading icon's place rather
                than its own width, so revealing it on hover, focus or an active
                selection never narrows the time or shifts the row. It stays
                keyboard-reachable (focusing it is what reveals it) and only
                takes pointer input while shown. The board-wide `avatar` (the
                agent helmet) leads EVERY board; `item.icon` is the fallback
                for boards that pass none. */}
            {(avatar || item.icon || showsSelect) && (
              <span
                className={cn(
                  "relative shrink-0 flex items-center justify-center",
                  !avatar && "size-3.5",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center transition-opacity duration-150",
                    showsSelect &&
                      (selectionActive
                        ? "opacity-0"
                        : "group-hover/card:opacity-0 group-focus-within/card:opacity-0"),
                  )}
                >
                  {avatar ?? item.icon}
                </span>
                {showsSelect && (
                  <span
                    className={cn(
                      "absolute inset-0 m-auto size-4 rounded-[5px] border flex items-center justify-center transition-opacity duration-150",
                      selectionActive
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none group-hover/card:opacity-100 group-hover/card:pointer-events-auto group-focus-within/card:opacity-100 group-focus-within/card:pointer-events-auto",
                      selectedForBulk
                        ? "bg-action border-action text-action-text"
                        : "bg-input border-ink-muted/40 text-transparent hover:border-ink",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedForBulk}
                      aria-label={l.selectTooltip}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelect?.();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-0 opacity-0 cursor-pointer size-full"
                    />
                    <Check
                      className="size-3 pointer-events-none"
                      strokeWidth={3}
                    />
                  </span>
                )}
              </span>
            )}
            {item.group && (
              <>
                <span className="hidden @min-card-agent/card:inline ml-1.5 min-w-0 text-[length:var(--ht-font-size-xxs)] text-ink-muted truncate">
                  {item.group}
                </span>
                <span
                  aria-hidden="true"
                  className="hidden @min-card-agent/card:inline ml-1 shrink-0 text-xs text-ink-muted"
                >
                  ·
                </span>
              </>
            )}
            <KanbanTime
              iso={item.lastMessageAt}
              formatTime={formatTime}
              compact
            />
          </div>
          <KanbanCardActionRow
            onApprove={showsApprove ? onApprove : undefined}
            onArchive={showsArchive ? onArchive : undefined}
            onRename={onRename && startRename}
            onDelete={
              onDelete &&
              ((returnFocusTo) => {
                deleteReturnFocus.current = returnFocusTo ?? null;
                setShowConfirm(true);
              })
            }
            labels={l}
          />
        </div>

        {/* Card body (title + description). Relative so the people stack can
           overlay the body's bottom-right corner (see below) without a
           dedicated strip row. With no people the wrapper has no absolute
           child, so `relative` is inert — zero layout change. */}
        <div className="relative">
          {/* Title */}
          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-[13px] font-medium text-ink bg-transparent border-b border-ink/20 outline-none w-full"
            />
          ) : (
            <p
              className={cn(
                "text-[13px] font-medium text-ink line-clamp-2 cursor-pointer",
                // The stack sits at the BOTTOM of the body, so it only needs to
                // clear the title when there is no description under it.
                !item.description && peopleGutter,
              )}
            >
              {item.title}
            </p>
          )}

          {/* Description */}
          {item.description && (
            <p
              className={cn(
                "text-xs text-ink-muted line-clamp-2 mt-1",
                peopleGutter,
              )}
            >
              {item.description}
            </p>
          )}

          {/* People stack, overlaying the body's bottom-right corner (over the
             description's final line, or the title when the description is
             empty/short). Absolutely positioned so it floats over existing
             content and never grows the card height; the strip row is gone.
             `ring-2 ring-input` on every face (from AvatarGroup) is the
             only separation from the text underneath — no border/divider. The
             expandable "+N" popover is portalled, so nothing clips it. Renders
             nothing when the mission has no people, leaving the card
             untouched.

             `right-0 bottom-0` is NOT flush with the card: this wrapper lives
             inside the card's own `p-3`, so the stack rests 12px from the card
             edge and its 2px ring bleeds 2px into that padding — the landing
             mock's `.faces { right: 10px; bottom: 10px }` optical inset. The
             text it floats over gets its clearance from `peopleGutter` above,
             mirroring the mock's `.tc-desc { padding-right }`. */}
          <KanbanPeople
            people={item.people}
            max={CARD_PEOPLE_MAX}
            size="sm"
            label={l.people}
            expandable
            expandLabel={l.peopleExpand}
            className="absolute right-0 bottom-0"
          />
        </div>

        {/* Footer: tags + custom actions. The Approve action moved to the
           top-right icon row (see above) so it's visually consistent with
           Rename / Delete and the tooltip explains exactly what it does.
           People are NOT here — they overlay the card body's bottom-right
           corner (see the body wrapper above). */}
        {(item.tags?.length || actions) && (
          <div className="flex items-center justify-between mt-2.5">
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              {item.tags?.map((tag) => (
                <KanbanTag key={tag} label={tag} />
              ))}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={l.deleteTitle(item.title)}
        description={l.deleteDescription}
        onConfirm={confirmDelete}
        onCloseAutoFocus={(e) => {
          const target = deleteReturnFocus.current;
          if (!target?.isConnected) return;
          e.preventDefault();
          target.focus();
        }}
      />
    </>
  );
}
