/**
 * Selection chrome holding the select-all checkbox in the Name column's tree
 * slot, the count, the destructive action and a way out. It replaces a column
 * header where that row exists; in the team frame it inserts above the rows and
 * shifts them by its height. No border or fill, just chrome on the canvas. It
 * arrives on a 200ms entrance (see `.files-selection-bar-in`).
 */
import { Button, cn } from "@houston-ai/core";
import { Trash2, X } from "lucide-react";
import { FilesCheckbox } from "./files-checkbox";
import { BASE_INDENT, HEADER_ROW, TRIANGLE_AREA } from "./files-list-chrome";
import type { FilesSelection } from "./files-selection";

/**
 * The tree-slot checkbox that acts on the whole visible listing. Shared by the
 * column header and this bar, so the two can never disagree about whether
 * everything on screen is checked.
 */
export function SelectAllCheckbox({
  selection,
}: {
  selection: FilesSelection;
}) {
  const all =
    selection.visiblePaths.length > 0 &&
    selection.visiblePaths.every((path) => selection.paths.has(path));
  return (
    <FilesCheckbox
      checked={all}
      indeterminate={!all && selection.paths.size > 0}
      label={selection.labels.selectAll}
      onToggle={selection.toggleAll}
    />
  );
}

export function FilesSelectionBar({
  selection,
}: {
  selection: FilesSelection;
}) {
  return (
    <div
      className={cn("flex items-center", HEADER_ROW, "files-selection-bar-in")}
    >
      <span
        className="flex shrink-0 items-center justify-center"
        style={{ marginLeft: BASE_INDENT, width: TRIANGLE_AREA }}
      >
        <SelectAllCheckbox selection={selection} />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="text-sm font-medium tabular-nums text-ink">
          {selection.labels.selectedCount(selection.paths.size)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 rounded-full text-danger hover:text-danger"
          onClick={selection.onDeleteSelected}
        >
          <Trash2 aria-hidden className="size-3.5" />
          {selection.labels.deleteSelected}
        </Button>
        <button
          type="button"
          aria-label={selection.labels.clearSelection}
          title={selection.labels.clearSelection}
          onClick={selection.clear}
          className="flex size-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
