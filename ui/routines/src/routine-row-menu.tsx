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
  name: string;
  onRunNow?: () => void;
  onStopRun?: () => void;
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
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onRunNow();
              }}
            >
              <Play className="size-3.5" />
              {labels.runNow}
            </DropdownMenuItem>
          )}
          {onStopRun && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onStopRun();
              }}
            >
              <Square className="size-3.5" />
              {labels.stopRun}
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              {hasPrior && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(true);
                }}
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
