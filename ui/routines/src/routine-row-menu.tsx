/**
 * RoutineRowMenu — the row's three-dot quick-actions menu: Run now / Stop run
 * (the row offers whichever fits the current run state), Edit manually (opens
 * the row's inline name/schedule/instruction panel), Edit with AI (opens the
 * routine's chat), and Delete (confirmed in a dialog, like the board's mission
 * cards). Always visible (never hover-gated); rows aren't clickable themselves,
 * so this menu is the only way in.
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
import {
  MoreHorizontal,
  Pencil,
  Play,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { DEFAULT_ROW_LABELS, interp, type RoutineRowLabels } from "./labels";

export interface RoutineRowMenuProps {
  /** The routine's display name, for the delete confirm title. */
  name: string;
  /** Fire the routine immediately. Mutually exclusive with `onStopRun` in
   *  practice — the row passes whichever fits the current run state. */
  onRunNow?: () => void;
  /** Stop the in-flight run. */
  onStopRun?: () => void;
  /** Open the row's inline edit panel. */
  onEditManually?: () => void;
  /** Open the routine's chat to change it by asking instead. */
  onEditWithAi?: () => void;
  /** Delete the routine — called only after the dialog confirms. */
  onDelete?: () => void;
  labels?: RoutineRowLabels;
  /** Icon for the "Edit with AI" entry. App supplies the real brand mark
   *  (`ui/` stays brand-agnostic per the library boundary); a generic
   *  wand is the standalone-caller default. */
  aiIcon?: ReactNode;
}

export function RoutineRowMenu({
  name,
  onRunNow,
  onStopRun,
  onEditManually,
  onEditWithAi,
  onDelete,
  labels = DEFAULT_ROW_LABELS,
  aiIcon = <Wand2 className="size-3.5" />,
}: RoutineRowMenuProps) {
  const [confirming, setConfirming] = useState(false);
  const hasPrior = onRunNow || onStopRun || onEditManually || onEditWithAi;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-ink-muted/60 hover:text-ink"
            aria-label={labels.moreActions}
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
          {onEditManually && (
            <DropdownMenuItem onClick={onEditManually}>
              <Pencil className="size-3.5" />
              {labels.editManually}
            </DropdownMenuItem>
          )}
          {onEditWithAi && (
            <DropdownMenuItem onClick={onEditWithAi}>
              {aiIcon}
              {labels.editWithAi}
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
