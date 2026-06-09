import { useState } from "react"
import {
  cn,
  ConfirmDialog,
  HighlightedText,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core"
import { Trash2 } from "lucide-react"
import type { BoardSearchSnippet, KanbanItem } from "./types"
import type { KanbanCardLabels } from "./kanban-card"

export interface KanbanListItemProps {
  item: KanbanItem
  /** Small agent icon shown at the leading edge. Falls back to the item's own
   *  `icon` when omitted, so a cross-agent list can show a per-row avatar. */
  avatar?: React.ReactNode
  /** Marks the row whose chat is currently open in the right panel. */
  selected?: boolean
  onSelect: () => void
  onDelete?: () => void
  labels?: KanbanCardLabels
  /** Matched body/history fragment shown below the title when the search match
   *  was found there rather than in the title (the title is never highlighted). */
  snippet?: BoardSearchSnippet
}

/**
 * Compact row for the Archived missions list: agent icon + name, mission title,
 * and a delete button. The title is shown plainly; when a search matched only
 * in the body/history, a short highlighted fragment appears below so the user
 * sees why the mission surfaced.
 */
export function KanbanListItem({
  item,
  avatar,
  selected = false,
  onSelect,
  onDelete,
  labels,
  snippet,
}: KanbanListItemProps) {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <div
        onClick={onSelect}
        aria-selected={selected || undefined}
        className={cn(
          "group/row flex gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
          // Compact single-line row when there's no snippet (the default
          // archived list); top-align only when a snippet pushes it taller.
          snippet ? "items-start" : "items-center",
          selected
            ? "border-transparent bg-accent shadow-sm"
            : "border-border bg-card hover:bg-accent/40",
        )}
      >
        {(avatar ?? item.icon) && (
          <span className={cn("shrink-0", snippet && "mt-0.5")}>{avatar ?? item.icon}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {item.group && (
              <span className="text-xs text-muted-foreground shrink-0 truncate max-w-[120px]">
                {item.group}
              </span>
            )}
            <span className="text-[13px] font-medium text-foreground flex-1 truncate">
              {item.title}
            </span>
          </div>
          {snippet && (
            <p className="mt-1 text-xs leading-snug text-muted-foreground line-clamp-2">
              <HighlightedText text={snippet.text} ranges={snippet.ranges} />
            </p>
          )}
        </div>
        {onDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirm(true)
                }}
                className={cn(
                  "shrink-0 p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors duration-200",
                  snippet && "mt-0.5",
                )}
                aria-label={labels?.deleteTooltip}
              >
                <Trash2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{labels?.deleteTooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={labels?.deleteTitle?.(item.title) ?? `Delete "${item.title}"?`}
        description={labels?.deleteDescription ?? ""}
        onConfirm={() => {
          onDelete?.()
          setConfirm(false)
        }}
      />
    </>
  )
}
