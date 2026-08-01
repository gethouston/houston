import {
  BulkActionBar,
  type BulkActionBarLabels,
  type BulkMoveTarget,
} from "@houston-ai/board";
import { Button } from "@houston-ai/core";
import { storeType } from "@houston-ai/store";
import { useState } from "react";

/**
 * The bar's labels and its live demo. Helper module: it exports no `specimen`.
 */

/** Every label the bar needs — it has no English defaults, because the app
 *  passes `t()` results and `ui/` stays language-agnostic. */
export const LABELS: BulkActionBarLabels = {
  selected: (count) => `${count} selected`,
  moveTo: "Move to",
  archive: "Archive",
  delete: "Delete",
  clear: "Clear selection",
  cancel: "Cancel",
  confirmMoveTitle: "Move these missions?",
  confirmMoveDescription: (count, target) =>
    `${count} missions will move to ${target}.`,
  confirmMoveAction: "Move",
  confirmArchiveTitle: "Archive these missions?",
  confirmArchiveDescription: (count) =>
    `${count} missions leave the board. You can still find them under Archived.`,
  confirmArchiveAction: "Archive",
  confirmDeleteTitle: "Delete these missions?",
  confirmDeleteDescription: (count) =>
    `${count} missions and their history are removed for good.`,
  confirmDeleteAction: "Delete",
};

/** The two sections a board selection can be moved to. */
export const MOVE_TARGETS: BulkMoveTarget[] = [
  { status: "needs_you", label: "Needs you" },
  { status: "done", label: "Done" },
];

/**
 * The bar as the board mounts it: floating over the bottom of the pane, with a
 * live selection behind it. Every action confirms first, so the outcome line
 * only changes once the dialog is accepted — no browser dialog anywhere.
 */
export function LiveBulkActionBar({
  moveTargets = MOVE_TARGETS,
  initialCount = 4,
}: {
  moveTargets?: BulkMoveTarget[];
  initialCount?: number;
}) {
  const [count, setCount] = useState(initialCount);
  const [outcome, setOutcome] = useState<string | null>(null);
  const report = (what: string) => {
    setOutcome(`${count} missions ${what}.`);
    setCount(0);
  };

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-xl bg-background p-4">
      <p className={storeType.meta}>
        {outcome ??
          `${count} missions are selected on the board behind this bar.`}
      </p>
      {count > 0 ? (
        <BulkActionBar
          count={count}
          moveTargets={moveTargets}
          labels={LABELS}
          onMove={(status) => report(`moved to ${status}`)}
          onArchive={() => report("archived")}
          onDelete={() => report("deleted")}
          onClear={() => setCount(0)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="-translate-x-1/2 absolute bottom-6 left-1/2"
          onClick={() => {
            setCount(initialCount);
            setOutcome(null);
          }}
        >
          Select them again
        </Button>
      )}
    </div>
  );
}
