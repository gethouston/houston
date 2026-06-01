import { useState } from "react"
import {
  cn,
  ConfirmDialog,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core"
import { Trash2 } from "lucide-react"
import type { KanbanItem } from "./types"
import type { KanbanCardLabels } from "./kanban-card"

export interface KanbanListItemProps {
  item: KanbanItem
  /** Small agent icon shown at the leading edge. */
  avatar?: React.ReactNode
  /** Marks the row whose chat is currently open in the right panel. */
  selected?: boolean
  onSelect: () => void
  onDelete?: () => void
  labels?: KanbanCardLabels
}

/**
 * Compact single-line row for the Archived missions list: agent icon + name,
 * mission title, and a delete button. No description / "first message" and a
 * visible border, so the list reads as short rectangles rather than the tall
 * kanban cards.
 */
export function KanbanListItem({
  item,
  avatar,
  selected = false,
  onSelect,
  onDelete,
  labels,
}: KanbanListItemProps) {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <div
        onClick={onSelect}
        aria-selected={selected || undefined}
        className={cn(
          "group/row flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
          selected
            ? "border-transparent bg-accent shadow-sm"
            : "border-border bg-card hover:bg-accent/40",
        )}
      >
        {avatar && <span className="shrink-0">{avatar}</span>}
        {item.group && (
          <span className="text-xs text-muted-foreground shrink-0 truncate max-w-[120px]">
            {item.group}
          </span>
        )}
        <span className="text-[13px] font-medium text-foreground flex-1 truncate">
          {item.title}
        </span>
        {onDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirm(true)
                }}
                className="shrink-0 p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors duration-200"
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
