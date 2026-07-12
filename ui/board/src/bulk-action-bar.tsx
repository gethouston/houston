import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Archive, ChevronDown, Trash2, X } from "lucide-react";
import { useState } from "react";

/** A status a selection can be moved to (e.g. Done / Needs me). */
export interface BulkMoveTarget {
  status: string;
  label: string;
}

export interface BulkActionBarLabels {
  selected: (count: number) => string;
  moveTo: string;
  archive: string;
  delete: string;
  clear: string;
  cancel: string;
  confirmMoveTitle: string;
  confirmMoveDescription: (count: number, target: string) => string;
  confirmMoveAction: string;
  confirmArchiveTitle: string;
  confirmArchiveDescription: (count: number) => string;
  confirmArchiveAction: string;
  confirmDeleteTitle: string;
  confirmDeleteDescription: (count: number) => string;
  confirmDeleteAction: string;
}

export interface BulkActionBarProps {
  count: number;
  moveTargets: BulkMoveTarget[];
  onMove: (status: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
  labels: BulkActionBarLabels;
}

type Pending =
  | { kind: "move"; target: BulkMoveTarget }
  | { kind: "archive" }
  | { kind: "delete" }
  | null;

/**
 * Floating action bar shown while one or more board cards are multi-
 * selected. Every action is confirmed before it runs (move / archive /
 * delete) so a bulk mistake can't silently mutate many missions at once.
 */
export function BulkActionBar({
  count,
  moveTargets,
  onMove,
  onArchive,
  onDelete,
  onClear,
  labels,
}: BulkActionBarProps) {
  const [pending, setPending] = useState<Pending>(null);

  const confirm = (() => {
    switch (pending?.kind) {
      case "move":
        return {
          title: labels.confirmMoveTitle,
          description: labels.confirmMoveDescription(
            count,
            pending.target.label,
          ),
          action: labels.confirmMoveAction,
          variant: "default" as const,
          run: () => onMove(pending.target.status),
        };
      case "archive":
        return {
          title: labels.confirmArchiveTitle,
          description: labels.confirmArchiveDescription(count),
          action: labels.confirmArchiveAction,
          variant: "default" as const,
          run: onArchive,
        };
      case "delete":
        return {
          title: labels.confirmDeleteTitle,
          description: labels.confirmDeleteDescription(count),
          action: labels.confirmDeleteAction,
          variant: "destructive" as const,
          run: onDelete,
        };
      default:
        return null;
    }
  })();

  return (
    <>
      <div
        data-keep-panel-open
        className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line/60 bg-popover/95 px-2 py-1.5 shadow-lg backdrop-blur"
      >
        <span className="px-2 text-xs font-medium tabular-nums text-ink-muted">
          {labels.selected(count)}
        </span>
        <span className="mx-0.5 h-5 w-px bg-line" />
        {moveTargets.length === 1 ? (
          // A locked selection can only move to one other section — show it
          // directly instead of a one-item dropdown.
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-full"
            onClick={() => setPending({ kind: "move", target: moveTargets[0] })}
          >
            {labels.moveTo} {moveTargets[0].label}
          </Button>
        ) : moveTargets.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 rounded-full"
              >
                {labels.moveTo}
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top">
              {moveTargets.map((target) => (
                <DropdownMenuItem
                  key={target.status}
                  onSelect={() => setPending({ kind: "move", target })}
                >
                  {target.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 rounded-full"
          onClick={() => setPending({ kind: "archive" })}
        >
          <Archive className="size-3.5" />
          {labels.archive}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 rounded-full text-danger hover:text-danger"
          onClick={() => setPending({ kind: "delete" })}
        >
          <Trash2 className="size-3.5" />
          {labels.delete}
        </Button>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <button
          type="button"
          aria-label={labels.clear}
          onClick={onClear}
          className="flex size-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.action}
        cancelLabel={labels.cancel}
        variant={confirm?.variant ?? "destructive"}
        onConfirm={() => {
          confirm?.run();
          setPending(null);
        }}
      />
    </>
  );
}
