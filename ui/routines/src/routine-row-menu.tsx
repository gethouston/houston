/**
 * RoutineRowMenu — the row's three-dot quick-actions menu: Run now / Stop run
 * (the row offers whichever fits the current run state) and Delete (confirmed in
 * a dialog, like the board's mission cards). Always visible (never hover-gated).
 * Opening a routine's chat and enabling/disabling it live on the row itself
 * (row click / "Open chat" affordance + the switch), so they are not repeated
 * here — this menu is only the run controls and the destructive action.
 */
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { MoreHorizontal, Play, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { DEFAULT_ROW_LABELS, interp, type RoutineRowLabels } from "./labels";

export interface RoutineRowMenuProps {
  /** The routine's display name, for the delete confirm title. */
  name: string;
  /** Fire the routine immediately. Mutually exclusive with `onStopRun` in
   *  practice — the row passes whichever fits the current run state. */
  onRunNow?: () => void;
  /** Stop the in-flight run. */
  onStopRun?: () => void;
  /** Delete the routine — called only after the dialog confirms. */
  onDelete?: () => void;
  labels?: RoutineRowLabels;
}

export function RoutineRowMenu({
  name,
  onRunNow,
  onStopRun,
  onDelete,
  labels = DEFAULT_ROW_LABELS,
}: RoutineRowMenuProps) {
  const [confirming, setConfirming] = useState(false);
  const hasPrior = onRunNow || onStopRun;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-ink-muted/60 hover:text-ink"
            aria-label={labels.moreActions}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {onRunNow && (
            <DropdownMenuItem onClick={onRunNow}>
              <Play className="size-3.5" />
              {labels.runNow}
            </DropdownMenuItem>
          )}
          {onStopRun && (
            <DropdownMenuItem onClick={onStopRun}>
              <Square className="size-3.5" />
              {labels.stopRun}
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              {hasPrior && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="size-3.5" />
                {labels.delete}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={interp(labels.deleteTitle, { name })}
        description={labels.deleteDescription}
        confirmLabel={labels.deleteConfirm}
        cancelLabel={labels.deleteCancel}
        onConfirm={() => {
          onDelete?.();
          setConfirming(false);
        }}
      />
    </>
  );
}
