import { useState, useRef, useEffect } from "react"
import {
  cn,
  ConfirmDialog,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core"
import { Trash2, Check, Pencil } from "lucide-react"
import type { KanbanItem } from "./types"
import { BOARD_CARD_DRAG_TYPE } from "./dnd"

export interface KanbanCardLabels {
  /** @deprecated kept for backward-compat. Was the visible Approve pill text;
   *  the action is now an icon-only button with `approveTooltip`. */
  approve?: string
  approveTooltip?: string
  renameTooltip?: string
  deleteTooltip?: string
  /** Delete confirm title, `{name}` substituted with `item.title`. */
  deleteTitle?: (name: string) => string
  deleteDescription?: string
  /** Accessible label for the multi-select checkbox. */
  selectTooltip?: string
}

const DEFAULT_LABELS: Required<KanbanCardLabels> = {
  approve: "Move to done",
  approveTooltip: "Move to done",
  renameTooltip: "Change title",
  deleteTooltip: "Delete",
  deleteTitle: (name) => `Delete "${name}"?`,
  deleteDescription: "This item and its history will be permanently removed.",
  selectTooltip: "Select",
}

export interface KanbanCardProps {
  item: KanbanItem
  onSelect: () => void
  onDelete?: () => void
  onApprove?: () => void
  onRename?: (newTitle: string) => void
  runningStatuses?: string[]
  approveStatuses?: string[]
  errorStatuses?: string[]
  actions?: React.ReactNode
  avatar?: React.ReactNode
  labels?: KanbanCardLabels
  /** Mark this card as the currently-open one in the right panel. */
  selected?: boolean
  /** Mark this card as keyboard-focused (highlighted via arrow nav, not yet
   *  opened). Renders a focus ring distinct from `selected`. */
  highlighted?: boolean
  /** Enable the multi-select checkbox. */
  selectable?: boolean
  /** Whether this card is part of the current multi-select set. */
  selectedForBulk?: boolean
  /** Whether ANY card is currently multi-selected (keeps every checkbox
   *  visible without hover so the affordance isn't hover-gated). */
  anySelected?: boolean
  /** Toggle this card's membership in the multi-select set. */
  onToggleSelect?: () => void
  /** Make the card draggable so it can be dropped onto another column.
   *  Suppressed while renaming or during a multi-select so it doesn't
   *  collide with those interactions. */
  enableDrag?: boolean
  /** Called when a drag of this card starts. */
  onDragStart?: () => void
  /** Called when a drag of this card ends (drop or cancel). */
  onDragEnd?: () => void
}

export function KanbanCard({
  item,
  onSelect,
  onDelete,
  onApprove,
  onRename,
  runningStatuses = ["running"],
  approveStatuses = ["needs_you"],
  errorStatuses = ["error"],
  actions,
  avatar,
  labels,
  selected = false,
  highlighted = false,
  selectable = false,
  selectedForBulk = false,
  anySelected = false,
  onToggleSelect,
  enableDrag = false,
  onDragStart,
  onDragEnd,
}: KanbanCardProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const isRunning = runningStatuses.includes(item.status)
  const isNeedsApproval = approveStatuses.includes(item.status)
  const isError = errorStatuses.includes(item.status)
  const [showConfirm, setShowConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.title)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Don't let a drag start while renaming (the title input owns the gesture)
  // or while a multi-select is active (the bulk action bar owns moves then).
  const canDrag = enableDrag && !editing && !anySelected

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowConfirm(true)
  }

  const confirmDelete = () => {
    onDelete?.()
    setShowConfirm(false)
  }

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(item.title)
    setEditing(true)
  }

  const commitRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== item.title) {
      onRename?.(trimmed)
    }
    setEditing(false)
  }

  return (
    <>
      <div
        onClick={(e) => { e.stopPropagation(); onSelect() }}
        draggable={canDrag}
        onDragStart={
          canDrag
            ? (e) => {
                e.dataTransfer.setData(BOARD_CARD_DRAG_TYPE, item.id)
                e.dataTransfer.effectAllowed = "move"
                setDragging(true)
                onDragStart?.()
              }
            : undefined
        }
        onDragEnd={() => {
          setDragging(false)
          onDragEnd?.()
        }}
        aria-selected={selected || undefined}
        data-highlighted={highlighted || undefined}
        // For running + active, override the running-glow inner fill
        // (--glow-bg) so the accent tint is visible through the rotating
        // border. The accent token is a translucent overlay (rgba), which
        // would let the conic gradient bleed through — flatten it via
        // color-mix to a solid tint that matches bg-accent rendered over
        // the card background.
        style={
          (selected || highlighted) && isRunning
            ? ({
                "--glow-bg":
                  "color-mix(in srgb, var(--color-background) 93%, currentColor 7%)",
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
          "group/card relative rounded-xl p-3 cursor-default transition-[background-color,box-shadow,border-color] duration-200",
          // The card no longer shows a grab/pointer cursor across its whole
          // surface — only the title reads as the clickable affordance (see
          // the title span below). Dragging still works from anywhere.
          selected || highlighted ? "bg-accent shadow-md" : "bg-background",
          // Running cards keep their own animated border untouched —
          // setting Tailwind's `border` would override the
          // `border-style: solid` from card-running-glow's shorthand
          // and kill the rotating gradient. For everything else, the
          // border is always 1px (transparent when active, gray
          // otherwise) so toggling state doesn't shift layout.
          isRunning
            ? "card-running-glow shadow-[0_2px_12px_rgba(59,130,246,0.12)]"
            : isError
              ? "border border-destructive/60 shadow-sm hover:shadow-md"
              : selected || highlighted
                ? "border border-transparent"
                : "border border-border/20 shadow-sm hover:shadow-md",
          // Multi-select ring sits on top of (not replacing) the card's
          // own border treatment so a selected running card keeps its glow.
          selectedForBulk &&
            "ring-2 ring-primary ring-offset-1 ring-offset-background",
          // Dim the card while it's being dragged.
          dragging && "opacity-40",
        )}
      >
        {/* Top row: agent info + action buttons */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Multi-select checkbox. Collapsed to zero width until the card
                is hovered/focused or a selection is active, so it reveals on
                hover (pushing the agent name right) yet stays keyboard-
                reachable — never a hover-only affordance. */}
            {selectable && onToggleSelect && (
              <div
                className={cn(
                  "shrink-0 overflow-hidden transition-all duration-150",
                  selectedForBulk || anySelected
                    ? "w-4 opacity-100"
                    : "w-0 opacity-0 group-hover/card:w-4 group-hover/card:opacity-100 group-focus-within/card:w-4 group-focus-within/card:opacity-100",
                )}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selectedForBulk}
                  aria-label={l.selectTooltip}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleSelect()
                  }}
                  className={cn(
                    "size-4 rounded-[5px] border flex items-center justify-center transition-colors",
                    selectedForBulk
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/40 text-transparent hover:border-foreground",
                  )}
                >
                  <Check className="size-3" strokeWidth={3} />
                </button>
              </div>
            )}
            {avatar ?? (
              item.icon && (
                <span className="size-3.5 shrink-0 flex items-center justify-center">
                  {item.icon}
                </span>
              )
            )}
            {item.group && (
              <span className="text-[11px] text-muted-foreground truncate">
                {item.group}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {!actions && isNeedsApproval && onApprove && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => { e.stopPropagation(); onApprove() }}
                    className="p-1 rounded-md text-muted-foreground/40 hover:text-[#00a240] hover:bg-[#00a240]/10 transition-colors duration-200"
                    aria-label={l.approveTooltip}
                  >
                    <Check className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{l.approveTooltip}</TooltipContent>
              </Tooltip>
            )}
            {onRename && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleRenameClick}
                    className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors duration-200"
                    aria-label={l.renameTooltip}
                  >
                    <Pencil className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{l.renameTooltip}</TooltipContent>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleDeleteClick}
                    className="p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors duration-200"
                    aria-label={l.deleteTooltip}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{l.deleteTooltip}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Title */}
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename()
              if (e.key === "Escape") setEditing(false)
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-[13px] font-medium text-foreground bg-transparent border-b border-foreground/20 outline-none w-full"
          />
        ) : (
          <p className="text-[13px] font-medium text-foreground line-clamp-2">
            {/* The title is the explicit click affordance: pointer cursor +
                underline on hover, scoped to the text glyphs. The click still
                bubbles to the card's onSelect, and `stopPropagation` keeps a
                title click from also triggering it twice. */}
            <span
              onClick={(e) => { e.stopPropagation(); onSelect() }}
              className="cursor-pointer hover:underline"
            >
              {item.title}
            </span>
          </p>
        )}

        {/* Description */}
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
            {item.description}
          </p>
        )}

        {/* Footer: tags + custom actions. The Approve action moved to the
           top-right icon row (see above) so it's visually consistent with
           Rename / Delete and the tooltip explains exactly what it does. */}
        {(item.tags?.length || actions) && (
          <div className="flex items-center justify-between mt-2.5">
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              {item.tags?.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-[18px] items-center rounded-full bg-secondary px-2 text-[10px] font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="shrink-0">
              {actions}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={l.deleteTitle(item.title)}
        description={l.deleteDescription}
        onConfirm={confirmDelete}
      />
    </>
  )
}
