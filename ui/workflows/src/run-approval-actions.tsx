/**
 * RunApprovalActions — shared approve/cancel control strip for workflow runs.
 */
import { cn, Button } from "@houston-ai/core"

export interface RunApprovalActionsProps {
  onApprove: () => void
  onCancel: () => void
  approveLabel: string
  cancelLabel: string
  approvePending?: boolean
  cancelPending?: boolean
  className?: string
  size?: "sm" | "default"
}

export function RunApprovalActions({
  onApprove,
  onCancel,
  approveLabel,
  cancelLabel,
  approvePending,
  cancelPending,
  className,
  size = "sm",
}: RunApprovalActionsProps) {
  return (
    <div className={cn("flex items-center justify-end gap-1.5", className)}>
      <Button
        variant="secondary"
        size={size}
        onClick={onCancel}
        disabled={approvePending || cancelPending}
      >
        {cancelLabel}
      </Button>
      <Button size={size} onClick={onApprove} disabled={approvePending}>
        {approvePending ? "…" : approveLabel}
      </Button>
    </div>
  )
}
