/**
 * RoutineRowMenu — the row's three-dot quick-actions menu: Rename (hands off to
 * the row's inline title editor) and Delete (confirmed in a dialog, like the
 * board's mission cards). Same trigger + menu idiom as the routine editor's
 * header overflow. Always visible (never hover-gated); the caller wraps it in a
 * propagation stop so opening the menu doesn't open the editor.
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
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { DEFAULT_ROW_LABELS, interp, type RoutineRowLabels } from "./labels";

export interface RoutineRowMenuProps {
  /** The routine's display name, for the delete confirm title. */
  name: string;
  /** Start the row's inline rename. */
  onRename?: () => void;
  /** Delete the routine — called only after the dialog confirms. */
  onDelete?: () => void;
  labels?: RoutineRowLabels;
}

export function RoutineRowMenu({
  name,
  onRename,
  onDelete,
  labels = DEFAULT_ROW_LABELS,
}: RoutineRowMenuProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/60 hover:text-foreground"
            aria-label={labels.moreActions}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {onRename && (
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="size-3.5" />
              {labels.rename}
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              {onRename && <DropdownMenuSeparator />}
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
