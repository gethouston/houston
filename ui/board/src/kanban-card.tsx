import { useState, useRef, useEffect } from "react"
import { cn, ConfirmDialog } from "@houston-ai/core"
import { KanbanCardActions } from "./kanban-card-actions"
import type { KanbanItem } from "./types"

export interface KanbanCardLabels {
  /** @deprecated kept for backward-compat. Was the visible Approve pill text;
   *  the action is now an icon-only button with `approveTooltip`. */
  approve?: string
  approveTooltip?: string
  renameTooltip?: string
  deleteTooltip?: string
  resumeTooltip?: string
  /** Delete confirm title, `{name}` substituted with `item.title`. */
  deleteTitle?: (name: string) => string
  deleteDescription?: string
}

const DEFAULT_LABELS: Required<KanbanCardLabels> = {
  approve: "Move to done",
  approveTooltip: "Move to done",
  renameTooltip: "Change title",
  deleteTooltip: "Delete",
  resumeTooltip: "Resume",
  deleteTitle: (name) => `Delete "${name}"?`,
  deleteDescription: "This item and its history will be permanently removed.",
}

export interface KanbanCardProps {
  item: KanbanItem
  onSelect: () => void
  onDelete?: () => void
  onApprove?: () => void
  onResume?: () => void
  onRename?: (newTitle: string) => void
  runningStatuses?: string[]
  approveStatuses?: string[]
  resumeStatuses?: string[]
  actions?: React.ReactNode
  avatar?: React.ReactNode
  labels?: KanbanCardLabels
}

export function KanbanCard({
  item,
  onSelect,
  onDelete,
  onApprove,
  onResume,
  onRename,
  runningStatuses = ["running"],
  approveStatuses = ["needs_you"],
  resumeStatuses = [],
  actions,
  avatar,
  labels,
}: KanbanCardProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const isRunning = runningStatuses.includes(item.status)
  const isNeedsApproval = approveStatuses.includes(item.status)
  const isResumable = resumeStatuses.includes(item.status)
  const [showConfirm, setShowConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const confirmDelete = () => {
    onDelete?.()
    setShowConfirm(false)
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
          <KanbanCardActions
            showApprove={!actions && isNeedsApproval}
            showResume={!actions && isResumable}
            onApprove={onApprove}
            onResume={onResume}
            onRename={onRename ? () => { setEditValue(item.title); setEditing(true) } : undefined}
            onDelete={onDelete ? () => setShowConfirm(true) : undefined}
            labels={{
              approveTooltip: l.approveTooltip,
              resumeTooltip: l.resumeTooltip,
              renameTooltip: l.renameTooltip,
              deleteTooltip: l.deleteTooltip,
            }}
          />
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
