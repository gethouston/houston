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
}

const DEFAULT_LABELS: Required<KanbanCardLabels> = {
  approve: "Move to done",
  approveTooltip: "Move to done",
  renameTooltip: "Change title",
  deleteTooltip: "Delete",
  deleteTitle: (name) => `Delete "${name}"?`,
  deleteDescription: "This item and its history will be permanently removed.",
}

export interface KanbanCardProps {
  item: KanbanItem
  onSelect: () => void
  onDelete?: () => void
  onApprove?: () => void
  onRename?: (newTitle: string) => void
  runningStatuses?: string[]
  approveStatuses?: string[]
  actions?: React.ReactNode
  avatar?: React.ReactNode
  labels?: KanbanCardLabels
}

export function KanbanCard({
  item,
  onSelect,
  onDelete,
  onApprove,
  onRename,
  runningStatuses = ["running"],
  approveStatuses = ["needs_you"],
  actions,
  avatar,
  labels,
}: KanbanCardProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const isRunning = runningStatuses.includes(item.status)
  const isNeedsApproval = approveStatuses.includes(item.status)
  const [showConfirm, setShowConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.title)
  const inputRef = useRef<HTMLInputElement>(null)

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
        className={cn(
          "group/card relative rounded-xl bg-background p-3 cursor-pointer transition-all duration-200",
          isRunning
            ? "card-running-glow shadow-[0_2px_12px_rgba(59,130,246,0.12)]"
            : "border border-border/20 shadow-sm hover:shadow-md",
        )}
      >
        {/* Top row: agent info + action buttons */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
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
            {item.title}
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
