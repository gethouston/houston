import { Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core"
import { Check, Pencil, RotateCw, Trash2 } from "lucide-react"

/**
 * The icon-button row at the top-right of every kanban card. Pulled out
 * of `kanban-card.tsx` so the card file stays under the 200-line cap
 * and so this stateless surface can be unit-tested in isolation.
 *
 * Each action button renders only if (a) its `on…` callback is supplied
 * AND (b) for Approve/Resume, the card is in a matching status. The
 * card's caller has already decided which statuses count as "approvable"
 * or "resumable" — this component just renders.
 */
export interface KanbanCardActionsProps {
  showApprove: boolean
  showResume: boolean
  onApprove?: () => void
  onResume?: () => void
  onRename?: () => void
  onDelete?: () => void
  labels: {
    approveTooltip: string
    resumeTooltip: string
    renameTooltip: string
    deleteTooltip: string
  }
}

export function KanbanCardActions({
  showApprove,
  showResume,
  onApprove,
  onResume,
  onRename,
  onDelete,
  labels,
}: KanbanCardActionsProps) {
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {showApprove && onApprove && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { stop(e); onApprove() }}
              className="p-1 rounded-md text-muted-foreground/40 hover:text-[#00a240] hover:bg-[#00a240]/10 transition-colors duration-200"
              aria-label={labels.approveTooltip}
            >
              <Check className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{labels.approveTooltip}</TooltipContent>
        </Tooltip>
      )}
      {showResume && onResume && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { stop(e); onResume() }}
              className="p-1 rounded-md text-muted-foreground/40 hover:text-[#0066cc] hover:bg-[#0066cc]/10 transition-colors duration-200"
              aria-label={labels.resumeTooltip}
            >
              {/* RotateCw, not Play. `Play` reads as "start fresh", which is
                  the opposite of what this affordance does — Resume picks up
                  the existing provider session_id and continues the
                  conversation in place. */}
              <RotateCw className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{labels.resumeTooltip}</TooltipContent>
        </Tooltip>
      )}
      {onRename && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { stop(e); onRename() }}
              className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors duration-200"
              aria-label={labels.renameTooltip}
            >
              <Pencil className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{labels.renameTooltip}</TooltipContent>
        </Tooltip>
      )}
      {onDelete && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { stop(e); onDelete() }}
              className="p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors duration-200"
              aria-label={labels.deleteTooltip}
            >
              <Trash2 className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{labels.deleteTooltip}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
